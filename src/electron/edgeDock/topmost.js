'use strict';

// Electron's setAlwaysOnTop stops landing on the dock's transparent frameless
// windows (observed on Electron 43 / v0.63: the rail is born non-topmost and
// isAlwaysOnTop() keeps reporting the stale cached true), so the poll enforces
// the band natively with SetWindowPos(HWND_TOPMOST) on the native handle.
// Lazy koffi like windowsBackdrop; a load failure degrades to a no-op because
// the Electron call still runs alongside it.
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const HWND_TOPMOST = 0xFFFFFFFF; // (HWND)-1

let api;

function createApi(koffi) {
  const user32 = koffi.load('user32.dll');
  return {
    setWindowPos: user32.func(
      'bool SetWindowPos(uintptr_t hwnd, uintptr_t after, int x, int y, int cx, int cy, uint flags)'
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

function nativeHandleOf(win) {
  const buffer = win.getNativeWindowHandle();
  return buffer.length >= 8 ? Number(buffer.readBigUInt64LE()) : buffer.readUInt32LE();
}

function forceTopmost(win, deps = {}) {
  if (!win || win.isDestroyed?.()) return false;
  const a = deps.api || loadApi();
  if (!a) return false;
  try {
    return Boolean(a.setWindowPos(
      nativeHandleOf(win), HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE
    ));
  } catch (_) {
    return false;
  }
}

module.exports = { createApi, forceTopmost };
