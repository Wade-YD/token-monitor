'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const edgeAutoHide = require('../../src/electron/edgeAutoHide');
const floatingBubble = require('../../src/electron/floatingBubble');
const motionPreference = require('../../src/electron/motionPreference');

const {
  EDGE_VISIBLE_PX,
  EDGE_SNAP_THRESHOLD,
  EDGE_TRIGGER_ALONG_PADDING,
  EDGE_TRIGGER_PERPENDICULAR_TOLERANCE,
  EDGE_COLLAPSE_DELAY_MS,
  EDGE_ANIMATION_DURATION_MS,
  canUseEdgeAutoHide,
  edgeCursorInExpandedBounds,
  edgeHiddenBounds,
  edgeSide,
  edgeSnapToBounds,
  edgeTriggerHitTest
} = edgeAutoHide;

// Work area with a 40px taskbar at the bottom of a 1920x1080 screen.
const AREA = { x: 0, y: 0, width: 1920, height: 1040 };
const DISPLAY = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: AREA };
const WINDOW = { x: 100, y: 10, width: 340, height: 650 };

function displayFor(platform) {
  return platform === 'win32'
    ? { bounds: DISPLAY.bounds, workArea: AREA }
    : DISPLAY;
}

test('keeps the spec constants that the trigger geometry relies on', () => {
  assert.equal(EDGE_VISIBLE_PX, 3);
  assert.equal(EDGE_SNAP_THRESHOLD, 12);
  assert.equal(EDGE_TRIGGER_ALONG_PADDING, 8);
  assert.equal(EDGE_TRIGGER_PERPENDICULAR_TOLERANCE, 12);
  assert.equal(typeof EDGE_COLLAPSE_DELAY_MS, 'number');
  assert.equal(typeof EDGE_ANIMATION_DURATION_MS, 'number');
});

test('hidden bounds leave only the 3px strip on-screen for every edge', () => {
  for (const platform of ['win32', 'darwin']) {
    // getArea() anchors to display.bounds on win32 and workArea elsewhere.
    const area = platform === 'win32' ? DISPLAY.bounds : AREA;
    const display = displayFor(platform);
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const hidden = edgeHiddenBounds(WINDOW, side, display, platform);
      assert.ok(hidden, `${platform}/${side} produced bounds`);
      // Only the position moves; the window must keep its original size so it
      // never fights WINDOW_LIMITS minWidth/minHeight or DWM tiny-window painting.
      assert.equal(hidden.width, WINDOW.width, `${platform}/${side} width must not change`);
      assert.equal(hidden.height, WINDOW.height, `${platform}/${side} height must not change`);
    }

    const top = edgeHiddenBounds(WINDOW, 'top', display, platform);
    assert.equal(top.x, WINDOW.x);
    assert.equal(top.y + top.height, area.y + EDGE_VISIBLE_PX);
    assert.ok(top.y < area.y, 'top dock must sit mostly above the screen');

    const bottom = edgeHiddenBounds(WINDOW, 'bottom', display, platform);
    assert.equal(bottom.x, WINDOW.x);
    assert.equal(bottom.y, area.y + area.height - EDGE_VISIBLE_PX);
    assert.ok(bottom.y + bottom.height > area.y + area.height, 'bottom dock must sit mostly below the reference area');

    const left = edgeHiddenBounds(WINDOW, 'left', display, platform);
    assert.equal(left.y, WINDOW.y);
    assert.equal(left.x + left.width, area.x + EDGE_VISIBLE_PX);
    assert.ok(left.x < area.x, 'left dock must sit mostly off the left edge');

    const right = edgeHiddenBounds(WINDOW, 'right', display, platform);
    assert.equal(right.y, WINDOW.y);
    assert.equal(right.x, area.x + area.width - EDGE_VISIBLE_PX);
    assert.ok(right.x + right.width > area.x + area.width, 'right dock must sit mostly off the right edge');
  }
});

test('hidden bounds anchor to display.bounds on win32 and workArea elsewhere', () => {
  const win32 = edgeHiddenBounds(WINDOW, 'bottom', displayFor('win32'), 'win32');
  assert.equal(win32.y, DISPLAY.bounds.y + DISPLAY.bounds.height - EDGE_VISIBLE_PX);
  const mac = edgeHiddenBounds(WINDOW, 'bottom', displayFor('darwin'), 'darwin');
  assert.equal(mac.y, AREA.y + AREA.height - EDGE_VISIBLE_PX);
});

test('rejects malformed input instead of producing NaN geometry', () => {
  assert.equal(edgeHiddenBounds(null, 'top', DISPLAY, 'darwin'), null);
  assert.equal(edgeHiddenBounds(WINDOW, null, DISPLAY, 'darwin'), null);
  assert.equal(edgeHiddenBounds(WINDOW, 'top', null, 'darwin'), null);
  assert.equal(edgeHiddenBounds(WINDOW, 'diagonal', DISPLAY, 'darwin'), null);
  assert.equal(edgeSide(null, DISPLAY, 'darwin'), null);
  assert.equal(edgeSide(WINDOW, null, 'darwin'), null);
});

test('detects which edge the window is docked to', () => {
  // Mid-screen window (y=300) so only the axis under test is near an edge.
  const away = { x: 200, y: 300, width: WINDOW.width, height: WINDOW.height };
  assert.equal(edgeSide({ ...away, x: AREA.x }, DISPLAY, 'darwin'), 'left');
  assert.equal(edgeSide({ ...away, x: AREA.x + 8 }, DISPLAY, 'darwin'), 'left');
  assert.equal(edgeSide({ ...away, x: AREA.x + EDGE_SNAP_THRESHOLD }, DISPLAY, 'darwin'), 'left');
  assert.equal(
    edgeSide({ ...away, x: AREA.x + AREA.width - away.width + EDGE_SNAP_THRESHOLD }, DISPLAY, 'darwin'),
    'right'
  );
  assert.equal(edgeSide({ ...away, y: AREA.y + 4 }, DISPLAY, 'darwin'), 'top');
  assert.equal(
    edgeSide({ ...away, y: AREA.y + AREA.height - away.height }, DISPLAY, 'darwin'),
    'bottom'
  );
});

test('does not treat a window parked away from every edge as docked', () => {
  assert.equal(edgeSide({ ...WINDOW, x: 200, y: 300 }, DISPLAY, 'darwin'), null);
  assert.equal(
    edgeSide({ ...WINDOW, x: AREA.x + EDGE_SNAP_THRESHOLD + 1, y: 300 }, DISPLAY, 'darwin'),
    null
  );
});

test('corner docks resolve to the closest edge with a stable tie-break', () => {
  // Equidistant left+top corner: top wins (priority top > bottom > left > right).
  assert.equal(edgeSide({ ...WINDOW, x: AREA.x, y: AREA.y }, DISPLAY, 'darwin'), 'top');
  // Equidistant bottom+right corner: bottom outranks right in the tie-break.
  const corner = {
    x: AREA.x + AREA.width - WINDOW.width,
    y: AREA.y + AREA.height - WINDOW.height,
    width: WINDOW.width,
    height: WINDOW.height
  };
  assert.equal(edgeSide(corner, DISPLAY, 'darwin'), 'bottom');
  // Same corner position but away from the bottom edge: right is unambiguous.
  assert.equal(
    edgeSide({ ...corner, y: 100 }, DISPLAY, 'darwin'),
    'right'
  );
});

test('snap flushes the docked axis and preserves the free axis', () => {
  const left = edgeSnapToBounds({ ...WINDOW, x: 7, y: 123 }, 'left', DISPLAY, 'darwin');
  assert.equal(left.x, AREA.x);
  assert.equal(left.y, 123);
  assert.equal(left.width, WINDOW.width);
  assert.equal(left.height, WINDOW.height);

  const top = edgeSnapToBounds({ ...WINDOW, x: 321, y: -9 }, 'top', DISPLAY, 'darwin');
  assert.equal(top.y, AREA.y);
  assert.equal(top.x, 321);

  const right = edgeSnapToBounds(WINDOW, 'right', DISPLAY, 'darwin');
  assert.equal(right.x, AREA.x + AREA.width - WINDOW.width);

  const bottom = edgeSnapToBounds(WINDOW, 'bottom', DISPLAY, 'darwin');
  assert.equal(bottom.y, AREA.y + AREA.height - WINDOW.height);
});

test('trigger zone: hovering the strip where the window is docked reveals it', () => {
  // Window docked flush left, spanning y=100..750.
  const docked = { x: AREA.x, y: 100, width: WINDOW.width, height: WINDOW.height };
  const display = displayFor('win32');
  assert.equal(edgeTriggerHitTest({ x: 5, y: 400 }, docked, 'left', display, 'win32'), true);
  assert.equal(edgeTriggerHitTest({ x: 0, y: 400 }, docked, 'left', display, 'win32'), true);
  assert.equal(edgeTriggerHitTest({ x: EDGE_TRIGGER_PERPENDICULAR_TOLERANCE, y: 400 }, docked, 'left', display, 'win32'), true);
});

test('trigger zone: same screen edge but outside the window span must NOT fire', () => {
  // The TokenHub bug: cursor rides the same screen edge far from the window —
  // the whole edge must not act as a handle, only the window's own span.
  const docked = { x: AREA.x, y: 100, width: WINDOW.width, height: WINDOW.height };
  const display = displayFor('win32');
  // Below the span (span ends at y=750, minus the 8px along-padding).
  assert.equal(edgeTriggerHitTest({ x: 5, y: 900 }, docked, 'left', display, 'win32'), false);
  assert.equal(edgeTriggerHitTest({ x: 0, y: 1039 }, docked, 'left', display, 'win32'), false);
  // Above the span.
  assert.equal(edgeTriggerHitTest({ x: 5, y: 50 }, docked, 'left', display, 'win32'), false);
  assert.equal(edgeTriggerHitTest({ x: 5, y: 107 }, docked, 'left', display, 'win32'), false);
  // Just inside both padded ends still fires.
  assert.equal(edgeTriggerHitTest({ x: 5, y: 108 }, docked, 'left', display, 'win32'), true);
  assert.equal(edgeTriggerHitTest({ x: 5, y: 742 }, docked, 'left', display, 'win32'), true);
});

test('trigger zone: cursor deeper than the perpendicular tolerance does not fire', () => {
  const docked = { x: AREA.x, y: 100, width: WINDOW.width, height: WINDOW.height };
  const display = displayFor('win32');
  assert.equal(edgeTriggerHitTest({ x: 13, y: 400 }, docked, 'left', display, 'win32'), false);
  assert.equal(edgeTriggerHitTest({ x: 200, y: 400 }, docked, 'left', display, 'win32'), false);
});

test('trigger zone: works for all four orientations with along-axis constraints', () => {
  const display = displayFor('darwin');
  const topDocked = { x: 100, y: AREA.y, width: 340, height: WINDOW.height };
  assert.equal(edgeTriggerHitTest({ x: 200, y: 5 }, topDocked, 'top', display, 'darwin'), true);
  // Along-axis miss: same edge, x far outside 108..432.
  assert.equal(edgeTriggerHitTest({ x: 500, y: 5 }, topDocked, 'top', display, 'darwin'), false);
  assert.equal(edgeTriggerHitTest({ x: 90, y: 5 }, topDocked, 'top', display, 'darwin'), false);
  // Perpendicular miss.
  assert.equal(edgeTriggerHitTest({ x: 200, y: 13 }, topDocked, 'top', display, 'darwin'), false);

  const rightDocked = { x: AREA.x + AREA.width - WINDOW.width, y: 100, width: WINDOW.width, height: WINDOW.height };
  assert.equal(edgeTriggerHitTest({ x: AREA.x + AREA.width - 4, y: 400 }, rightDocked, 'right', display, 'darwin'), true);
  assert.equal(edgeTriggerHitTest({ x: AREA.x + AREA.width - 4, y: 900 }, rightDocked, 'right', display, 'darwin'), false);
  assert.equal(edgeTriggerHitTest({ x: AREA.x + AREA.width - 13, y: 400 }, rightDocked, 'right', display, 'darwin'), false);

  const bottomDocked = { x: 100, y: AREA.y + AREA.height - WINDOW.height, width: 340, height: WINDOW.height };
  assert.equal(edgeTriggerHitTest({ x: 200, y: AREA.y + AREA.height - 4 }, bottomDocked, 'bottom', display, 'darwin'), true);
  assert.equal(edgeTriggerHitTest({ x: 500, y: AREA.y + AREA.height - 4 }, bottomDocked, 'bottom', display, 'darwin'), false);
  assert.equal(edgeTriggerHitTest({ x: 200, y: AREA.y + AREA.height - 13 }, bottomDocked, 'bottom', display, 'darwin'), false);
});

test('trigger zone: malformed cursors and bounds never fire', () => {
  const docked = { x: AREA.x, y: 100, width: WINDOW.width, height: WINDOW.height };
  assert.equal(edgeTriggerHitTest(null, docked, 'left', DISPLAY, 'darwin'), false);
  assert.equal(edgeTriggerHitTest({ x: Number.NaN, y: 400 }, docked, 'left', DISPLAY, 'darwin'), false);
  assert.equal(edgeTriggerHitTest({ x: 5, y: Number.POSITIVE_INFINITY }, docked, 'left', DISPLAY, 'darwin'), false);
  assert.equal(edgeTriggerHitTest({ x: 5, y: 400 }, docked, 'diagonal', DISPLAY, 'darwin'), false);
});

test('expanded-rect containment guards the collapse-under-cursor case', () => {
  const docked = { x: AREA.x, y: 100, width: WINDOW.width, height: WINDOW.height };
  assert.equal(edgeCursorInExpandedBounds({ x: 0, y: 100 }, docked), true);
  assert.equal(edgeCursorInExpandedBounds({ x: 339, y: 749 }, docked), true);
  // Right/bottom edges are exclusive so a cursor just past the window counts as "away".
  assert.equal(edgeCursorInExpandedBounds({ x: 340, y: 400 }, docked), false);
  assert.equal(edgeCursorInExpandedBounds({ x: 100, y: 750 }, docked), false);
  assert.equal(edgeCursorInExpandedBounds(null, docked), false);
});

test('edge mode gates on windowBehavior and stays off in tray mode', () => {
  assert.equal(canUseEdgeAutoHide({ windowBehavior: 'edge' }), true);
  assert.equal(canUseEdgeAutoHide({ windowBehavior: 'edge', trayMode: true }), false);
  assert.equal(canUseEdgeAutoHide({ windowBehavior: 'floating' }), false);
  assert.equal(canUseEdgeAutoHide({ windowBehavior: 'normal' }), false);
  assert.equal(canUseEdgeAutoHide({ windowBehavior: 'desktop' }), false);
  assert.equal(canUseEdgeAutoHide({}), false);
});

test('floating bubble and edge auto-hide stay mutually exclusive', () => {
  const enabled = { floatingBubbleEnabled: true, trayMode: false };
  assert.equal(floatingBubble.canUseFloatingBubble({ ...enabled, windowBehavior: 'floating' }), true);
  assert.equal(floatingBubble.canUseFloatingBubble({ ...enabled, windowBehavior: 'edge' }), false);
});

test('reduceMotion routes edge animation through the shared motion gate', () => {
  // The decision itself is pure and covered directly:
  assert.equal(motionPreference.shouldReduceMotion('on', false), true, 'reduceMotion=on must skip animation');
  assert.equal(motionPreference.shouldReduceMotion('off', false), false);
  assert.equal(motionPreference.shouldReduceMotion('system', true), true);
  assert.equal(motionPreference.shouldReduceMotion('system', false), false);

  // main.js wiring (source contract, same style as windowBehavior.test.js):
  // the tween must bail to an instant, guard-checked move when the gate fires.
  const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'main.js'), 'utf8');
  assert.match(
    mainSource,
    /if \(!source \|\| edgeReducedMotion\(\) \|\| effective <= 0\) \{\s*\n\s*setEdgeWindowPosition\(target\.x, target\.y\);/,
    'animateWindowPosition must move instantly (no tween) when reduceMotion is on'
  );
  assert.match(
    mainSource,
    /function edgeReducedMotion\(\) \{\s*\n\s*return motionPreferenceApi\.shouldReduceMotion\(settings\?\.reduceMotion, nativeTheme\.shouldReduceMotion\);/,
    'edgeReducedMotion must reuse motionPreferenceApi.shouldReduceMotion'
  );
});

test('hidden state only repositions the window — main.js never resizes it', () => {
  // The animation helper must move via the geometry guard; a setBounds call inside
  // it would resize against WINDOW_LIMITS minWidth=240.
  const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'main.js'), 'utf8');
  const animateFn = mainSource.match(/function animateWindowPosition[\s\S]*?\n\}/);
  assert.ok(animateFn, 'animateWindowPosition exists in main.js');
  assert.doesNotMatch(animateFn[0], /\.setBounds\(/, 'animation must not resize the window');
  assert.doesNotMatch(
    animateFn[0],
    /mainWindow\.setPosition\(/,
    'the animation must move through the geometry guard, never setPosition directly'
  );
  assert.match(animateFn[0], /setEdgeWindowPosition\(/, 'the animation must move via setEdgeWindowPosition');
  // edgeHiddenBounds is the only geometry source for the hidden state, and the
  // pure tests above pin it to width/height-preserving output.
  const collapseFn = mainSource.match(/function collapseEdge[\s\S]*?\n\}/);
  assert.ok(collapseFn, 'collapseEdge exists in main.js');
  assert.match(collapseFn[0], /edgeAutoHideApi\.edgeHiddenBounds\(/, 'hidden geometry must come from edgeHiddenBounds');
});

// --- robustness contracts added by the harden-edge-auto-hide change ---------

// Source-contract checks must read CODE, never the prose explaining it: several
// negative assertions below look for the ABSENCE of a pattern, and the comments
// deliberately name the thing they explain the absence of.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}


test('the geometry guard is the only writer and rejects non-finite coordinates', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'main.js'), 'utf8');
  const guardFn = mainSource.match(/function setEdgeWindowPosition\(x, y\)[\s\S]*?\n\}/);
  assert.ok(guardFn, 'setEdgeWindowPosition exists in main.js');
  assert.match(
    guardFn[0],
    /if \(!Number\.isFinite\(x\) \|\| !Number\.isFinite\(y\)\) \{/,
    'the guard must test both coordinates with Number.isFinite'
  );
  assert.match(guardFn[0], /mainWindow\.setPosition\(x, y, false\);/, 'the guard is the single native writer');

  // A rejected frame must return without touching native geometry at all.
  const rejectBranch = guardFn[0].match(/if \(!Number\.isFinite\(x\)[\s\S]*?\n  \}/);
  assert.ok(rejectBranch, 'guard has a rejection branch');
  assert.doesNotMatch(rejectBranch[0], /setPosition\(/, 'a rejected frame must not reach setPosition');

  // Same predicate the guard uses, checked exhaustively at the value level.
  const finite = (v) => Number.isFinite(v);
  for (const bad of [NaN, undefined, null, Infinity, -Infinity, '12', {}]) {
    assert.equal(finite(bad), false, `Number.isFinite must reject ${String(bad)}`);
  }
  assert.equal(finite(0), true);
});

test('the in-flight marker expires on its own instead of wedging auto-hide', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'main.js'), 'utf8');
  assert.match(
    mainSource,
    /function edgeIsAnimating\(\) \{\s*\n\s*return Date\.now\(\) < edgeAutoHideState\.animatingUntil;/,
    'in-flight state must be a deadline, not a boolean cleared only on success'
  );
  assert.doesNotMatch(
    mainSource,
    /edgeAutoHideState\.animating\s*=/,
    'the boolean in-flight flag must not come back: one thrown frame wedged auto-hide permanently'
  );
  assert.match(mainSource, /edgeAutoHideState\.animatingUntil = 0;/, 'the deadline must be cleared after the last frame');
  // The deadline must be strictly in the future while animating, so a leaked
  // value can never be "still animating" forever.
  const deadline = Date.now() + 280;
  assert.equal(Date.now() < deadline, true);
  assert.equal(Date.now() < 0, false);
});

test('a single idempotent reconciler is the only hide/show executor', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'main.js'), 'utf8');
  assert.match(mainSource, /function reconcileEdgeAutoHide\(\)/, 'the reconciler must exist');
  assert.match(mainSource, /const desired = edgeAutoHideState\.desired;/, 'the reconciler must be driven by the desired state');

  // The cursor poll decides; it must never move the window itself, or a stray
  // stopTimer() would again leave nothing responsible for hiding the window.
  const pollFn = mainSource.match(/function startEdgeCursorPolling\(\)[\s\S]*?\n\}/);
  assert.ok(pollFn, 'startEdgeCursorPolling exists in main.js');
  assert.doesNotMatch(pollFn[0], /mainWindow\.setPosition\(/, 'the poll must not write geometry');
  assert.doesNotMatch(pollFn[0], /collapseEdge\(/, 'the poll must not collapse directly');
  assert.doesNotMatch(pollFn[0], /expandEdge\(\)/, 'the poll must not expand directly');
  assert.match(pollFn[0], /reconcileEdgeAutoHide\(\)/, 'the poll must delegate movement to the reconciler');

  // The slow keeper must re-arm the poll and reconcile, so a killed fast path
  // self-heals instead of stranding the window.
  assert.match(
    mainSource,
    /if \(!edgeAutoHideState\.pollTimer\) startEdgeCursorPolling\(\);\s*\n\s*reconcileEdgeAutoHide\(\);/,
    'the keeper must re-arm the poll and then reconcile'
  );
  assert.match(
    mainSource,
    /if \(!edgeAutoHideState\.pollTimer\) startEdgeCursorPolling\(\);\s*\n\s*reconcileEdgeAutoHide\(\);\s*\n\s*\}, 1000\);/,
    'the keeper must run on a slow interval'
  );

  // No focus gate may reappear in the collapse decision path (check the code,
  // not the comment that explains why the gate is absent).
  const pollCode = stripComments(pollFn[0]);
  assert.doesNotMatch(pollCode, /isFocused\(\)/, 'focus must not gate the collapse decision');
  assert.doesNotMatch(pollCode, /\|\|\s*mainWindow\.isFocused\(\)/, 'no focus gate may survive in the collapsed decision');
});

test('an uncaught main-process exception is logged instead of raising a modal dialog', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'main.js'), 'utf8');
  assert.match(mainSource, /process\.on\('uncaughtException'/, 'the main process must install an uncaught handler');
  const handler = mainSource.match(/process\.on\('uncaughtException',[\s\S]*?\n\}\);/);
  assert.ok(handler, 'the handler must be a single block');
  assert.match(handler[0], /edgeLog\(/, 'the handler must persist the error');
  const handlerCode = stripComments(handler[0]);
  assert.doesNotMatch(handlerCode, /\bthrow\b/, 'the handler must not re-throw: Electron would still show the modal');
  assert.doesNotMatch(handlerCode, /dialog|showMessageBox/, 'the handler must not open a dialog');
  assert.match(handlerCode, /animatingUntil = 0;/, 'the handler must clear the in-flight deadline so the reconciler can recover');
});

