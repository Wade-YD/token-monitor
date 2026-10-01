'use strict';

// Electron's setAlwaysOnTop stops landing on the dock's transparent frameless
// windows after upstream rebuilds their native shells (observed on Electron 43
// / v0.63: getNativeWindowHandle() keeps returning a stale handle, GLE=1400
// ERROR_INVALID_WINDOW_HANDLE, while the JS window still paints), so the poll
// enforces the band by locating the live dock windows through FindWindowExW
// and driving SetWindowPos(HWND_TOPMOST) on the real handles directly.
// Lazy koffi like windowsBackdrop; a load failure degrades to a no-op because
// the Electron call still runs alongside it.
//
// HWND_TOPMOST must be -1 (all 64 bits set). Declaring the SetWindowPos "after"
// parameter as uintptr_t zero-extends a JS 0xFFFFFFFF into 0x00000000FFFFFFFF,
// which is an invalid window handle and fails every call - the sweep silently
// raised nothing for its whole first life. intptr_t + -1 encodes correctly.
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const HWND_TOPMOST = -1; // (HWND)-1
const GWL_EXSTYLE = -20;
const WS_EX_TRANSPARENT = 0x00000020;
// WM_MOUSEACTIVATE with wParam=the window and lParam=MAKELPARAM(HTCLIENT,
// WM_LBUTTONDOWN): asking a window how it will treat a real click. Healthy
// non-activating windows answer MA_NOACTIVATE (3) and the click is delivered;
// Electron 43 flipped to MA_NOACTIVATEANDEAT (4) after native shell rebuilds,
// which eats every hardware click while hover moves keep flowing - the "dock
// paints fine but cannot be dragged" state. The probe is a pure query: the
// activation decision is made by win32k from the return value, not by the
// handler, so asking costs nothing and changes nothing.
const WM_MOUSEACTIVATE = 0x0021;
const MA_PROBE_LPARAM = (1 << 16) | 0x0201; // HTCLIENT | WM_LBUTTONDOWN
const MA_NOACTIVATEANDEAT = 4;

let api;
let lastHwndKey = null;

function createApi(koffi) {
  const user32 = koffi.load('user32.dll');
  return {
    findWindowExW: user32.func(
      'uintptr_t FindWindowExW(uintptr_t parent, uintptr_t after, str16 class, str16 title)'
    ),
    getWindowLongPtrW: user32.func('intptr_t GetWindowLongPtrW(uintptr_t hwnd, int index)'),
    setWindowLongPtrW: user32.func(
      'intptr_t SetWindowLongPtrW(uintptr_t hwnd, int index, intptr_t value)'
    ),
    setWindowPos: user32.func(
      'int SetWindowPos(uintptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint flags)'
    ),
    isWindowVisible: user32.func('bool IsWindowVisible(uintptr_t hwnd)'),
    isWindow: user32.func('bool IsWindow(uintptr_t hwnd)'),
    sendMessage: user32.func(
      'intptr_t SendMessageW(uintptr_t hwnd, uint msg, uintptr_t wp, intptr_t lp)'
    )
  };
}

function loadApi() {
  if (api !== undefined) return api;
  api = null;
  try {
    if (process.platform === 'win32') {
      api = createApi(require('koffi'));
    }
  } catch (_) {
    api = null;
  }
  return api;
}

// The three dock surfaces share the visible title "Token Monitor Dock" (the
// main window is titled "Token Monitor"), live in the same window class, and
// are top-level - so FindWindowExW over that pair finds exactly our dock
// windows, whichever native shell the JS window currently fronts.
function dockHwnds(a, options = {}) {
  const out = [];
  let after = 0;
  for (;;) {
    const hwnd = a.findWindowExW(0, after, 'Chrome_WidgetWin_1', 'Token Monitor Dock');
    if (!hwnd) break;
    after = hwnd;
    // The class+title pair is unique to this app's dock surfaces, so no
    // per-window process check is needed here (and the koffi _Out_ fill was
    // unreliable on this call path - it silently filtered every match).
    if (!options.includeHidden && !a.isWindowVisible(hwnd)) continue;
    out.push(Number(hwnd));
  }
  return out;
}

// Enforces TOPMOST on every live dock window of this process. Returns the
// number of windows successfully raised; 0 means the guard found nothing (or
// the native calls are unavailable) and the caller may fall back. The hidden
// window set is tracked separately so the caller can log native shell rebuilds
// (the hwnd identities change while the JS windows keep running).
function forceTopmostDockWindows(deps = {}) {
  const a = deps.api || loadApi();
  if (!a) return 0;
  let raised = 0;
  const visible = [];
  for (const hwnd of dockHwnds(a)) {
    visible.push(hwnd);
    try {
      if (a.setWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE)) raised += 1;
    } catch (_) { /* one bad window must not stop the sweep */ }
  }
  if (typeof deps.onHwndSetChange === 'function') {
    const all = dockHwnds(a, { includeHidden: true });
    // FindWindowExW walks in z-order, which our own sweep rotates every tick -
    // compare (and report) the identity SET, order-insensitively.
    const key = [...all].sort((x, y) => x - y).join(',');
    if (lastHwndKey !== null && key !== lastHwndKey) {
      try { deps.onHwndSetChange({ hwnds: all, previous: lastHwndKey }); } catch (_) {}
    }
    lastHwndKey = key;
  }
  return raised;
}

// Asks every visible dock window how it treats a real click. `broken` means at
// least one answers MA_NOACTIVATEANDEAT, i.e. hardware clicks on that surface
// never reach the renderer. Returns null when the native layer is unavailable.
function probeDockInput(deps = {}) {
  const a = deps.api || loadApi();
  if (!a) return null;
  const hwnds = dockHwnds(a);
  const codes = hwnds.map((hwnd) => {
    try {
      return Number(a.sendMessage(hwnd, WM_MOUSEACTIVATE, hwnd, MA_PROBE_LPARAM));
    } catch (_) {
      return null;
    }
  });
  return { hwnds, codes, broken: codes.some((code) => code === MA_NOACTIVATEANDEAT) };
}

// Per-window variant kept for callers that already hold a live window object;
// the by-title sweep above is the primary path because JS-held handles go
// stale across upstream's native shell rebuilds.
function forceTopmost(win, deps = {}) {
  if (!win || win.isDestroyed?.()) return false;
  const a = deps.api || loadApi();
  if (!a) return false;
  const buffer = win.getNativeWindowHandle();
  const handle = buffer.length >= 8 ? Number(buffer.readBigUInt64LE()) : buffer.readUInt32LE();
  try {
    return Boolean(a.setWindowPos(handle, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE));
  } catch (_) {
    return false;
  }
}

// Clears WS_EX_TRANSPARENT from a dock window's real top-level handle.
// Electron's setIgnoreMouseEvents(false) stopped landing on these windows the
// same way setAlwaysOnTop did, and a surface shown while flagged click-through
// stays input-dead - this is the native half of that restore.
function clearMouseTransparent(win, deps = {}) {
  if (!win || win.isDestroyed?.()) return false;
  const a = deps.api || loadApi();
  if (!a) return false;
  const buffer = win.getNativeWindowHandle();
  const handle = buffer.length >= 8 ? Number(buffer.readBigUInt64LE()) : buffer.readUInt32LE();
  try {
    const style = a.getWindowLongPtrW(handle, GWL_EXSTYLE);
    if (!(style & WS_EX_TRANSPARENT)) return true;
    return Boolean(a.setWindowLongPtrW(handle, GWL_EXSTYLE, style & ~WS_EX_TRANSPARENT));
  } catch (_) {
    return false;
  }
}

module.exports = {
  clearMouseTransparent,
  createApi,
  dockHwnds,
  forceTopmost,
  forceTopmostDockWindows,
  probeDockInput
};
