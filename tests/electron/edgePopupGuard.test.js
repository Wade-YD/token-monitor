'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const guard = require('../../src/electron/edgePopupGuard');

const OUR_PID = 4242;
const MAIN_HWND = 5;

// Fake user32 surface: top-level windows keyed by hwnd, each with a pid, a
// rect and (optionally) a GA_ROOT that differs from itself (owned popups).
function fakeBindings(spec) {
  const windows = spec.windows || {};
  return {
    windowFromPoint: (pt) => {
      for (const [hwnd, w] of Object.entries(windows)) {
        const r = w.rect;
        if (pt.x >= r.x && pt.x < r.x + r.w && pt.y >= r.y && pt.y < r.y + r.h) return Number(hwnd);
      }
      return 0;
    },
    getAncestor: (hwnd, flags) => {
      assert.equal(flags, guard.GA_ROOT, 'the guard must resolve roots with GA_ROOT');
      return windows[hwnd]?.root ?? hwnd;
    },
    getWindowThreadProcessId: (hwnd, out) => { out.value = windows[hwnd]?.pid ?? 0; },
    getForegroundWindow: () => spec.foreground || 0,
    gaRoot: guard.GA_ROOT,
    currentPid: OUR_PID
  };
}

const MAIN = { hwnd: MAIN_HWND, pid: OUR_PID, rect: { x: 300, y: 0, w: 300, h: 400 } };
const POPUP = { hwnd: 10, pid: OUR_PID, rect: { x: 700, y: 100, w: 200, h: 300 } }; // far outside MAIN
const FOREIGN = { hwnd: 20, pid: 9999, rect: { x: 700, y: 100, w: 200, h: 300 } };
const DASH = { hwnd: 30, pid: OUR_PID, rect: { x: 0, y: 500, w: 920, h: 620 } }; // persistent dashboard window

test('the cursor resting on an owned popup holds the window open', () => {
  const bindings = fakeBindings({ windows: { [MAIN.hwnd]: MAIN, [POPUP.hwnd]: POPUP } });
  const holds = (cursor) => guard.createPopupGuard(bindings, MAIN_HWND, cursor);
  assert.equal(holds({ x: 800, y: 200 }), true, 'cursor inside the popup');
  assert.equal(holds({ x: 450, y: 200 }), false, 'cursor inside the main window is the ordinary hold path, not the popup guard');
  assert.equal(holds({ x: 50, y: 500 }), false, 'cursor on the desktop must not hold');
});

test('the main window itself never counts as a popup', () => {
  const bindings = fakeBindings({ windows: { [MAIN.hwnd]: MAIN, [POPUP.hwnd]: POPUP } });
  const holds = (cursor) => guard.createPopupGuard(bindings, MAIN_HWND, cursor);
  // Point at the main window while the popup exists elsewhere.
  assert.equal(holds({ x: 400, y: 100 }), false);
});

test('a foreign application under the cursor must not hold', () => {
  const bindings = fakeBindings({ windows: { [FOREIGN.hwnd]: FOREIGN } });
  const holds = (cursor) => guard.createPopupGuard(bindings, MAIN_HWND, cursor);
  assert.equal(holds({ x: 800, y: 200 }), false);
});

test('an owned popup holding focus holds the window even when the cursor left it', () => {
  const bindings = fakeBindings({
    windows: { [MAIN.hwnd]: MAIN, [POPUP.hwnd]: POPUP },
    foreground: POPUP.hwnd
  });
  const holds = (cursor) => guard.createPopupGuard(bindings, MAIN_HWND, cursor);
  assert.equal(holds({ x: 100, y: 800 }), true);
});

test('an owned child resolves to its owner root before the pid check', () => {
  // Owned popups are top-level, but defend the GA_ROOT hop anyway: a child
  // window of our popup must be attributed to the popup's root.
  const child = { hwnd: 11, pid: OUR_PID, rect: POPUP.rect, root: POPUP.hwnd };
  const bindings = fakeBindings({ windows: { [MAIN.hwnd]: MAIN, [POPUP.hwnd]: POPUP, [child.hwnd]: child } });
  const holds = (cursor) => guard.createPopupGuard(bindings, MAIN_HWND, cursor);
  assert.equal(holds({ x: 800, y: 200 }), true);
});

test('the cursor resting on the dashboard (a persistent second window) must not hold the dock open', () => {
  // Reported bug: entering the dashboard froze the home panel spread over it,
  // because the guard treated every own-process window as a transient popup.
  const bindings = fakeBindings({ windows: { [MAIN.hwnd]: MAIN, [DASH.hwnd]: DASH } });
  const holds = (cursor) => guard.createPopupGuard(bindings, MAIN_HWND, cursor, null, [DASH.hwnd]);
  assert.equal(holds({ x: 400, y: 800 }), false, 'working in the dashboard must let the dock fold away');
});

test('the dashboard holding focus must not hold the dock open either', () => {
  // The foreground veto was designed for focused popups; the dashboard takes
  // focus for the whole working session, so it must be exempt on that path too.
  const bindings = fakeBindings({
    windows: { [MAIN.hwnd]: MAIN, [DASH.hwnd]: DASH },
    foreground: DASH.hwnd
  });
  const holds = (cursor) => guard.createPopupGuard(bindings, MAIN_HWND, cursor, null, [DASH.hwnd]);
  assert.equal(holds({ x: 100, y: 100 }), false);
});

test('an unknown own-process popup still holds while the dashboard is exempted', () => {
  // Exempting the dashboard must not weaken the guard for the popups it was
  // built for: the color chooser is not on the persistent list and still holds.
  const bindings = fakeBindings({ windows: { [MAIN.hwnd]: MAIN, [POPUP.hwnd]: POPUP, [DASH.hwnd]: DASH } });
  const holds = (cursor) => guard.createPopupGuard(bindings, MAIN_HWND, cursor, null, [DASH.hwnd]);
  assert.equal(holds({ x: 800, y: 200 }), true);
});

test('without an exemption list the conservative default holds (backwards compatible)', () => {
  // Callers that do not pass persistentHwnds keep the original behavior: every
  // own-process window other than main holds the dock open.
  const bindings = fakeBindings({ windows: { [MAIN.hwnd]: MAIN, [DASH.hwnd]: DASH } });
  const holds = (cursor) => guard.createPopupGuard(bindings, MAIN_HWND, cursor);
  assert.equal(holds({ x: 400, y: 800 }), true);
});

test('missing FFI bindings degrade to false and never throw', () => {
  assert.equal(guard.createPopupGuard(null, MAIN_HWND, { x: 800, y: 200 }), false);
  const throwing = fakeBindings({ windows: { [POPUP.hwnd]: POPUP } });
  throwing.windowFromPoint = () => { throw new Error('native blew up'); };
  assert.equal(guard.createPopupGuard(throwing, MAIN_HWND, { x: 800, y: 200 }), false);
});

test('the packaged entry degrades gracefully when koffi is unavailable', () => {
  // In the pure-Node test runs koffi cannot resolve from the checkout, so the
  // lazy loader must produce null instead of throwing.
  const api = guard.loadApi();
  assert.ok(api === null || typeof api === 'object', 'loadApi returns bindings or null');
});

test('main.js consults the popup guard before arming and before firing a collapse', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'main.js'), 'utf8');
  assert.match(mainSource, /const edgePopupGuardApi = require\('\.\/edgePopupGuard'\);/, 'the guard module is wired in');
  const pollFn = mainSource.match(/function startEdgeCursorPolling\(\)[\s\S]*?\n\}/);
  assert.ok(pollFn, 'startEdgeCursorPolling exists');
  const pollCode = stripComments(pollFn[0]);
  assert.match(
    pollCode,
    /if \(edgeNativePopupHoldsCursor\(cursor\)\) \{/,
    'the arm path must ask the popup guard first'
  );
  const timerBody = pollCode.match(/collapseTimer = setTimeout\(\(\) => \{[\s\S]*?\}, edgeAutoHideApi\.EDGE_COLLAPSE_DELAY_MS\);/);
  assert.ok(timerBody, 'the collapse timer exists');
  assert.match(timerBody[0], /edgeNativePopupHoldsCursor\(cursorNow\)/, 'an armed collapse must be vetoed when a popup appears');
});

// Shared with the source-contract assertions above.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
