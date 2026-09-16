'use strict';

// Native popups we spawn ourselves — the <input type=color> chooser, context
// menus, <select> dropdowns — are top-level windows that can sit far outside
// the BrowserWindow rect. The cursor-based collapse would fold the docked
// window up the moment the cursor enters one of them (observed while picking
// vendor colors). This module answers a single question: is the cursor over a
// top-level window that belongs to this process but is not the main one — or
// does such a window hold focus? If yes, the docked window must stay revealed.

const GA_ROOT = 2;

// Same handle-width handling as windowsBackdrop.js: x64 handles arrive as an
// 8-byte buffer, 32-bit as 4. HWNDs are 32-bit significant, so Number() is safe.
function hwndOf(win) {
  const buffer = win.getNativeWindowHandle();
  return buffer.length >= 8 ? Number(buffer.readBigUInt64LE()) : buffer.readUInt32LE();
}

let cachedApi; // undefined = not tried yet; null = tried and unavailable

// Lazy, best-effort, once. koffi lives outside the asar (native module), so a
// checkout without node_modules — as in the pure-Node test runs — must degrade
// to "no guard" instead of throwing.
function loadApi() {
  if (cachedApi !== undefined) return cachedApi;
  cachedApi = null;
  try {
    if (process.platform === 'win32') {
      const koffi = require('koffi');
      const user32 = koffi.load('user32.dll');
      const POINT = koffi.struct('TOKEN_MONITOR_CURSOR_POINT', { x: 'long', y: 'long' });
      const DWORD = koffi.struct('TOKEN_MONITOR_POPUP_PID', { value: 'uint32_t' });
      cachedApi = {
        // WindowFromPoint takes POINT by value; the _Out_ struct fills the
        // passed plain object back (koffi >= 3 semantics, verified live).
        windowFromPoint: user32.func('uintptr_t WindowFromPoint(TOKEN_MONITOR_CURSOR_POINT point)'),
        getAncestor: user32.func('uintptr_t GetAncestor(uintptr_t hwnd, uint32_t flags)'),
        getWindowThreadProcessId: user32.func('uint32_t GetWindowThreadProcessId(uintptr_t hwnd, _Out_ TOKEN_MONITOR_POPUP_PID *pid)'),
        getForegroundWindow: user32.func('uintptr_t GetForegroundWindow()'),
        gaRoot: GA_ROOT
      };
    }
  } catch (_) {
    cachedApi = null;
  }
  return cachedApi;
}

// The decision itself, pure over injected bindings so it is testable without a
// display. bindings: { windowFromPoint, getAncestor, getWindowThreadProcessId,
// getForegroundWindow, gaRoot, currentPid }. mainHwnd: Number | null.
function popupHoldsCollapseWith(bindings, mainHwnd, cursor) {
  if (!bindings || !cursor) return false;
  const owned = (hwnd) => {
    if (!hwnd) return false;
    if (mainHwnd !== null && hwnd === mainHwnd) return false;
    const out = { value: 0 };
    bindings.getWindowThreadProcessId(hwnd, out);
    return out.value === bindings.currentPid;
  };
  try {
    const under = bindings.windowFromPoint({ x: Math.round(cursor.x), y: Math.round(cursor.y) });
    if (under) {
      const root = bindings.getAncestor(under, bindings.gaRoot) || under;
      if (owned(root)) return true;
    }
    const fg = bindings.getForegroundWindow();
    if (fg) {
      const fgRoot = bindings.getAncestor(fg, bindings.gaRoot) || fg;
      if (owned(fgRoot)) return true;
    }
  } catch (_) {
    // A failed native call must never wedge the window open: fold as before.
    return false;
  }
  return false;
}

function popupHoldsCollapse({ mainHwnd, cursor } = {}) {
  const bindings = loadApi();
  if (!bindings) return false;
  return popupHoldsCollapseWith(bindings, mainHwnd === null || mainHwnd === undefined ? null : Number(mainHwnd), cursor);
}

module.exports = {
  GA_ROOT,
  hwndOf,
  loadApi,
  createPopupGuard: popupHoldsCollapseWith,
  popupHoldsCollapse
};
