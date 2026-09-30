'use strict';

// Electron's setAlwaysOnTop stops landing on the dock's transparent frameless
// windows after upstream rebuilds their native shells (observed on Electron 43
// / v0.63: getNativeWindowHandle() keeps returning a stale handle, GLE=1400
// ERROR_INVALID_WINDOW_HANDLE, while the JS window still paints), so the poll
// enforces the band by locating the live dock windows through FindWindowExW
// and driving SetWindowPos(HWND_TOPMOST) on the real handles directly.
// Lazy koffi like windowsBackdrop; a load failure degrades to a no-op because
// the Electron call still runs alongside it.
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const HWND_TOPMOST = 0xFFFFFFFF; // (HWND)-1
const GA_ROOT = 2;

let api;

function createApi(koffi) {
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  koffi.struct('TOKEN_MONITOR_TOPMOST_PID', { value: 'uint32_t' });
  return {
    findWindowExW: user32.func(
      'uintptr_t FindWindowExW(uintptr_t parent, uintptr_t after, str16 class, str16 title)'
    ),
    setWindowPos: user32.func(
      'bool SetWindowPos(uintptr_t hwnd, uintptr_t after, int x, int y, int cx, int cy, uint flags)'
    ),
    isWindowVisible: user32.func('bool IsWindowVisible(uintptr_t hwnd)')
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
function dockHwnds(a) {
  const out = [];
  let after = 0;
  for (;;) {
    const hwnd = a.findWindowExW(0, after, 'Chrome_WidgetWin_1', 'Token Monitor Dock');
    if (!hwnd) break;
    after = hwnd;
    // The class+title pair is unique to this app's dock surfaces, so no
    // per-window process check is needed here (and the koffi _Out_ fill was
    // unreliable on this call path - it silently filtered every match).
    if (!a.isWindowVisible(hwnd)) continue;
    out.push(Number(hwnd));
  }
  return out;
}

// Enforces TOPMOST on every live dock window of this process. Returns the
// number of windows successfully raised; 0 means the guard found nothing (or
// the native calls are unavailable) and the caller may fall back.
function forceTopmostDockWindows(deps = {}) {
  const a = deps.api || loadApi();
  if (!a) return 0;
  let raised = 0;
  for (const hwnd of dockHwnds(a)) {
    try {
      if (a.setWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE)) raised += 1;
    } catch (_) { /* one bad window must not stop the sweep */ }
  }
  return raised;
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

module.exports = { createApi, forceTopmost, forceTopmostDockWindows, dockHwnds };
