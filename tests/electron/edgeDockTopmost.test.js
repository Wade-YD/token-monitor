'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createApi, dockHwnds, forceTopmost, forceTopmostDockWindows } = require('../../src/electron/edgeDock/topmost');

function fakeWindow(handleValue) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(handleValue));
  return {
    getNativeWindowHandle: () => buffer,
    isDestroyed: () => false
  };
}

// Fake koffi library: records binding signatures and emulates a small desktop
// with dock windows (ours, by title) plus a decoy from another process.
function fakeKoffi(state) {
  state.calls = state.calls || [];
  state.signatures = state.signatures || [];
  return {
    struct: () => ({}),
    load: () => ({
      func: (signature) => {
        state.signatures.push(signature);
        if (signature.startsWith('uintptr_t FindWindowExW')) {
          return (parent, after, cls, title) => {
            state.calls.push(['find', Number(after), cls, title]);
            const pool = state.windows.filter((w) => !after || Number(w.hwnd) > Number(after));
            return pool.length ? pool[0].hwnd : 0;
          };
        }
        if (signature.startsWith('uint GetWindowThreadProcessId')) {
          return (hwnd, out) => {
            const w = state.windows.find((x) => Number(x.hwnd) === Number(hwnd));
            out.value = w ? w.pid : 0;
            return 4711;
          };
        }
        if (signature.startsWith('uint GetCurrentProcessId')) {
          return () => state.pid;
        }
        if (signature.startsWith('bool IsWindowVisible')) {
          return (hwnd) => {
            const w = state.windows.find((x) => Number(x.hwnd) === Number(hwnd));
            return w ? w.visible : false;
          };
        }
        if (signature.startsWith('bool SetWindowPos') || signature.startsWith('int SetWindowPos')) {
          return (hwnd, after) => {
            state.calls.push(['setpos', Number(hwnd), Number(after)]);
            return 1;
          };
        }
        if (signature.startsWith('intptr_t SendMessageW')) {
          return (hwnd, msg, wp, lp) => {
            state.calls.push(['sendmsg', Number(hwnd), Number(msg), Number(lp)]);
            const w = state.windows.find((x) => Number(x.hwnd) === Number(hwnd));
            return w ? w.mouseActivate : 3;
          };
        }
        return () => 0;
      }
    })
  };
}

test('dockHwnds walks same-titled top-level windows of our process only', () => {
  const state = {
    pid: 4242,
    windows: [
      { hwnd: 100, pid: 4242, visible: true },   // dock 1
      { hwnd: 101, pid: 4242, visible: true },   // dock 2
      { hwnd: 102, pid: 999, visible: true },    // same title, other process
      { hwnd: 103, pid: 4242, visible: false }   // hidden dock surface
    ]
  };
  const api = createApi(fakeKoffi(state));
  const hwnds = dockHwnds(api, 4242);
  assert.deepEqual(hwnds, [100, 101, 102]);
  assert.ok(state.calls.some((c) => c[0] === 'find' && c[2] === 'Chrome_WidgetWin_1' && c[3] === 'Token Monitor Dock'));
});

test('forceTopmostDockWindows raises every live dock window', () => {
  const state = {
    pid: 4242,
    windows: [
      { hwnd: 100, pid: 4242, visible: true },
      { hwnd: 101, pid: 4242, visible: true },
      { hwnd: 500, pid: 777, visible: true }
    ]
  };
  const api = createApi(fakeKoffi(state));
  assert.equal(forceTopmostDockWindows({ pid: 4242, api }), 3);
  const raised = state.calls.filter((c) => c[0] === 'setpos').map((c) => c[1]);
  assert.deepEqual(raised.sort((a, b) => a - b), [100, 101, 500]);
});

test('forceTopmost drives SetWindowPos with HWND_TOPMOST on the given handle', () => {
  const state = { pid: 4242, windows: [{ hwnd: 100, pid: 4242, visible: true }] };
  const api = createApi(fakeKoffi(state));
  assert.equal(forceTopmost(fakeWindow(133636), { api }), true);
  const raised = state.calls.filter((c) => c[0] === 'setpos').map((c) => c[1]);
  assert.deepEqual(raised, [133636]);
  // The "after" parameter must be intptr_t: uintptr_t zero-extends a JS
  // 0xFFFFFFFF into an invalid 64-bit handle and SetWindowPos never lands.
  assert.ok(state.signatures.some((s) => s.includes('SetWindowPos(uintptr_t hwnd, intptr_t after')));
  assert.ok(state.calls.some((c) => c[0] === 'setpos' && c[2] === -1));
});

test('forceTopmostDockWindows reports hwnd set changes for rebuild tracking', () => {
  const state = {
    pid: 4242,
    windows: [
      { hwnd: 100, pid: 4242, visible: true },
      { hwnd: 101, pid: 4242, visible: true }
    ]
  };
  const changes = [];
  const api = createApi(fakeKoffi(state));
  forceTopmostDockWindows({ api, onHwndSetChange: (info) => changes.push(info) });
  assert.deepEqual(changes, []); // first observation records silently
  state.windows[0].visible = false; // hidden surfaces stay in the tracked set: a rebuild swaps every hwnd
  state.windows.push({ hwnd: 500, pid: 4242, visible: true });
  forceTopmostDockWindows({ api, onHwndSetChange: (info) => changes.push(info) });
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].hwnds, [100, 101, 500]);
  assert.equal(changes[0].previous, '100,101');
});
