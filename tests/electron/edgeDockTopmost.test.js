'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createApi, forceTopmost } = require('../../src/electron/edgeDock/topmost');

function fakeWindow(handleValue) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(handleValue));
  return {
    getNativeWindowHandle: () => buffer,
    isDestroyed: () => false
  };
}

function fakeKoffi(calls) {
  return {
    load: () => ({
      func: (signature) => {
        calls.push(signature);
        return (hwnd, after) => {
          calls.push(['SetWindowPos', hwnd, after]);
          return true;
        };
      }
    })
  };
}

test('forceTopmost drives SetWindowPos with HWND_TOPMOST and no-activate flags', () => {
  const calls = [];
  const api = createApi(fakeKoffi(calls));
  // Signature registers once; the SetWindowPos call lands with the recorded fn.
  const registrations = calls.filter((c) => typeof c === 'string');
  assert.equal(registrations.length, 1);
  assert.match(registrations[0], /SetWindowPos\(uintptr_t hwnd, uintptr_t after/);

  assert.equal(forceTopmost(fakeWindow(133636), { api }), true);
  const applied = calls.filter((c) => Array.isArray(c)).at(-1);
  assert.deepEqual(applied, ['SetWindowPos', 133636, 4294967295]);
});

test('forceTopmost passes the injected api through and tolerates failures', () => {
  const seen = [];
  const api = {
    setWindowPos: (hwnd, after) => {
      seen.push([hwnd, after]);
      return true;
    }
  };
  assert.equal(forceTopmost(fakeWindow(42), { api }), true);
  assert.deepEqual(seen, [[42, 4294967295]]);

  const exploding = {
    setWindowPos: () => { throw new Error('dwm refused'); }
  };
  assert.equal(forceTopmost(fakeWindow(42), { api: exploding }), false, 'errors degrade to false');
  assert.equal(forceTopmost({ isDestroyed: () => true }, { api }), false, 'destroyed windows are skipped');
});

test('forceTopmost without a usable api is a clean no-op', () => {
  // The app ships koffi, but a checkout without node_modules must degrade.
  assert.equal(forceTopmost(fakeWindow(133636), { api: null }), false);
});
