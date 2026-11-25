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
  EDGE_WIN32_FRAME_OVERHANG_PX,
  EDGE_INTERACTION_MARGIN_PX,
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
    // Win32 compensates the DWM frame overhang; the strip width is measured on
    // the OUTER Win32 rect, which extends overhang px past the Electron bounds.
    const oh = platform === 'win32' ? EDGE_WIN32_FRAME_OVERHANG_PX : 0;
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
    // Outer bottom = top.y + top.height + oh must sit at area.y + EDGE_VISIBLE_PX.
    assert.equal(top.y + top.height + oh, area.y + EDGE_VISIBLE_PX);
    assert.ok(top.y < area.y, 'top dock must sit mostly above the screen');

    const bottom = edgeHiddenBounds(WINDOW, 'bottom', display, platform);
    assert.equal(bottom.x, WINDOW.x);
    // No compensation: the visible top edge is cut by the screen edge itself.
    assert.equal(bottom.y, area.y + area.height - EDGE_VISIBLE_PX);
    assert.ok(bottom.y + bottom.height > area.y + area.height, 'bottom dock must sit mostly below the reference area');

    const left = edgeHiddenBounds(WINDOW, 'left', display, platform);
    assert.equal(left.y, WINDOW.y);
    assert.equal(left.x + left.width + oh, area.x + EDGE_VISIBLE_PX);
    assert.ok(left.x < area.x, 'left dock must sit mostly off the left edge');

    const right = edgeHiddenBounds(WINDOW, 'right', display, platform);
    assert.equal(right.y, WINDOW.y);
    assert.equal(right.x - oh, area.x + area.width - EDGE_VISIBLE_PX);
    assert.ok(right.x + right.width > area.x + area.width, 'right dock must sit mostly off the right edge');
  }
});

test('win32 hidden bounds shift by the measured DWM overhang, bottom does not', () => {
  // Measured on Win11 26200: Electron {y:-480,h:483} -> Win32 {top:-480,bottom:9}.
  assert.equal(EDGE_WIN32_FRAME_OVERHANG_PX, 6);
  // Window 340x650 at the origin screen.
  const top = edgeHiddenBounds(WINDOW, 'top', displayFor('win32'), 'win32');
  assert.equal(top.y, DISPLAY.bounds.y + EDGE_VISIBLE_PX - WINDOW.height - EDGE_WIN32_FRAME_OVERHANG_PX);
  const left = edgeHiddenBounds(WINDOW, 'left', displayFor('win32'), 'win32');
  assert.equal(left.x, DISPLAY.bounds.x + EDGE_VISIBLE_PX - WINDOW.width - EDGE_WIN32_FRAME_OVERHANG_PX);
  const right = edgeHiddenBounds(WINDOW, 'right', displayFor('win32'), 'win32');
  assert.equal(right.x, DISPLAY.bounds.x + DISPLAY.bounds.width - EDGE_VISIBLE_PX + EDGE_WIN32_FRAME_OVERHANG_PX);
  // Bottom dock is exact on both platforms (no overhang on the top border).
  const bottomWin = edgeHiddenBounds(WINDOW, 'bottom', displayFor('win32'), 'win32');
  const bottomMac = edgeHiddenBounds(WINDOW, 'bottom', displayFor('darwin'), 'darwin');
  assert.equal(bottomWin.y, DISPLAY.bounds.y + DISPLAY.bounds.height - EDGE_VISIBLE_PX);
  assert.equal(bottomMac.y, AREA.y + AREA.height - EDGE_VISIBLE_PX);
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

test('the interaction margin keeps a cursor on a resize border inside the hold test', () => {
  // The resize border sits on the Win32 outer frame, ~6px past the Electron
  // rect; a cursor resting there must count as "using the window".
  assert.equal(EDGE_INTERACTION_MARGIN_PX, 10);
  const docked = { x: AREA.x, y: 100, width: WINDOW.width, height: WINDOW.height };
  // 4px past each side: outside the rect, inside the margin.
  assert.equal(edgeCursorInExpandedBounds({ x: 344, y: 400 }, docked, EDGE_INTERACTION_MARGIN_PX), true, 'right border');
  assert.equal(edgeCursorInExpandedBounds({ x: 170, y: 754 }, docked, EDGE_INTERACTION_MARGIN_PX), true, 'bottom border');
  assert.equal(edgeCursorInExpandedBounds({ x: -4, y: 400 }, docked, EDGE_INTERACTION_MARGIN_PX), true, 'left border');
  assert.equal(edgeCursorInExpandedBounds({ x: 170, y: 96 }, docked, EDGE_INTERACTION_MARGIN_PX), true, 'top border');
  // Beyond the margin counts as away again.
  assert.equal(edgeCursorInExpandedBounds({ x: 170, y: 761 }, docked, EDGE_INTERACTION_MARGIN_PX), false);
  assert.equal(edgeCursorInExpandedBounds({ x: 351, y: 400 }, docked, EDGE_INTERACTION_MARGIN_PX), false);
  // Default (no margin) keeps the exclusive-rect contract.
  assert.equal(edgeCursorInExpandedBounds({ x: 344, y: 400 }, docked), false);
  // A non-finite margin degrades to 0 instead of widening the rect forever.
  assert.equal(edgeCursorInExpandedBounds({ x: 344, y: 400 }, docked, Number.NaN), false);
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

  // Controller wiring (source contract, same style as windowBehavior.test.js):
  // the tween must bail to an instant, guard-checked move when the gate fires.
  const controllerSource = readControllerSource();
  assert.match(
    controllerSource,
    /if \(!source \|\| edgeReducedMotion\(\) \|\| effective <= 0\) \{\s*\n\s*setEdgeWindowPosition\(target\.x, target\.y\);/,
    'animateWindowPosition must move instantly (no tween) when reduceMotion is on'
  );
  assert.match(
    controllerSource,
    /function edgeReducedMotion\(\) \{\s*\n\s*return motionPreferenceApi\.shouldReduceMotion\(getSettings\(\)\?\.reduceMotion, nativeTheme\.shouldReduceMotion\);/,
    'edgeReducedMotion must reuse motionPreferenceApi.shouldReduceMotion'
  );
});

test('hidden state only repositions the window — the controller never resizes it', () => {
  // The animation helper must move via the geometry guard; a setBounds call inside
  // it would resize against WINDOW_LIMITS minWidth=240.
  const controllerSource = readControllerSource();
  const animateFn = controllerSource.match(/function animateWindowPosition[\s\S]*?\n  \}/);
  assert.ok(animateFn, 'animateWindowPosition exists in the controller');
  assert.doesNotMatch(animateFn[0], /\.setBounds\(/, 'animation must not resize the window');
  assert.doesNotMatch(
    animateFn[0],
    /getWindow\(\)\.setPosition\(/,
    'the animation must move through the geometry guard, never setPosition directly'
  );
  assert.match(animateFn[0], /setEdgeWindowPosition\(/, 'the animation must move via setEdgeWindowPosition');
  // edgeHiddenBounds is the only geometry source for the hidden state, and the
  // pure tests above pin it to width/height-preserving output.
  const collapseFn = controllerSource.match(/function collapseEdge[\s\S]*?\n  \}/);
  assert.ok(collapseFn, 'collapseEdge exists in the controller');
  assert.match(collapseFn[0], /edgeAutoHideApi\.edgeHiddenBounds\(/, 'hidden geometry must come from edgeHiddenBounds');
});

// --- robustness contracts added by the harden-edge-auto-hide change ---------

// Source-contract checks must read CODE, never the prose explaining it: several
// negative assertions below look for the ABSENCE of a pattern, and the comments
// deliberately name the thing they explain the absence of.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

// The edge state machine moved verbatim from main.js into the controller module;
// contract tests below read whichever file owns the code under assertion.
function readMainSource() {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'main.js'), 'utf8');
}

function readControllerSource() {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'edgeAutoHideController.js'), 'utf8');
}

test('main.js never touches the controller-private edge state', () => {
  // The state machine moved into edgeAutoHideController.js; main.js has no
  // edgeAutoHideState binding, so any direct reference there is a ReferenceError
  // at window creation (the v0.97.0 rebase resurrected one such line by unioning
  // a refactor's before/after sides - the app started with a blank renderer).
  const code = stripComments(readMainSource());
  assert.doesNotMatch(code, /\bedgeAutoHideState\b/,
    'main.js must reach the state machine only through the edgeAutoHide facade');
});


test('the geometry guard is the only writer and rejects non-finite coordinates', () => {
  const controllerSource = readControllerSource();
  const guardFn = controllerSource.match(/function setEdgeWindowPosition\(x, y\)[\s\S]*?\n  \}/);
  assert.ok(guardFn, 'setEdgeWindowPosition exists in the controller');
  assert.match(
    guardFn[0],
    /if \(!Number\.isFinite\(x\) \|\| !Number\.isFinite\(y\)\) \{/,
    'the guard must test both coordinates with Number.isFinite'
  );
  assert.match(guardFn[0], /getWindow\(\)\.setPosition\(x, y, false\);/, 'the guard is the single native writer');

  // A rejected frame must return without touching native geometry at all.
  const rejectBranch = guardFn[0].match(/if \(!Number\.isFinite\(x\)[\s\S]*?\n    \}/);
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
  const controllerSource = readControllerSource();
  assert.match(
    controllerSource,
    /function edgeIsAnimating\(\) \{\s*\n\s*return Date\.now\(\) < edgeAutoHideState\.animatingUntil;/,
    'in-flight state must be a deadline, not a boolean cleared only on success'
  );
  assert.doesNotMatch(
    controllerSource,
    /edgeAutoHideState\.animating\s*=/,
    'the boolean in-flight flag must not come back: one thrown frame wedged auto-hide permanently'
  );
  assert.match(controllerSource, /edgeAutoHideState\.animatingUntil = 0;/, 'the deadline must be cleared after the last frame');
  // The deadline must be strictly in the future while animating, so a leaked
  // value can never be "still animating" forever.
  const deadline = Date.now() + 280;
  assert.equal(Date.now() < deadline, true);
  assert.equal(Date.now() < 0, false);
});

test('a single idempotent reconciler is the only hide/show executor', () => {
  const controllerSource = readControllerSource();
  const mainSource = readMainSource();
  assert.match(controllerSource, /function reconcileEdgeAutoHide\(\)/, 'the reconciler must exist');
  assert.match(controllerSource, /const desired = edgeAutoHideState\.desired;/, 'the reconciler must be driven by the desired state');

  // The cursor poll decides; it must never move the window itself, or a stray
  // stopTimer() would again leave nothing responsible for hiding the window.
  const pollFn = controllerSource.match(/function startEdgeCursorPolling\(\)[\s\S]*?\n  \}/);
  assert.ok(pollFn, 'startEdgeCursorPolling exists in the controller');
  assert.doesNotMatch(pollFn[0], /getWindow\(\)\.setPosition\(/, 'the poll must not write geometry');
  assert.doesNotMatch(pollFn[0], /collapseEdge\(/, 'the poll must not collapse directly');
  assert.doesNotMatch(pollFn[0], /expandEdge\(\)/, 'the poll must not expand directly');
  assert.match(pollFn[0], /reconcileEdgeAutoHide\(\)/, 'the poll must delegate movement to the reconciler');

  // The slow keeper must re-arm the poll and reconcile, so a killed fast path
  // self-heals instead of stranding the window. The interval itself is wired in
  // main.js and forwards to the controller's tick body.
  assert.match(
    mainSource,
    /setInterval\(\(\) => edgeAutoHide\.keeperTick\(\), 1000\);/,
    'the keeper must run on a slow interval wired in main.js'
  );
  assert.match(
    controllerSource,
    /function keeperTick\(\) \{\s*\n\s*if \(!canUseEdgeAutoHide\(getSettings\(\)\)\) return;\s*\n\s*if \(!getWindow\(\) \|\| getWindow\(\)\.isDestroyed\(\) \|\| !getWindow\(\)\.isVisible\(\)\) return;\s*\n\s*if \(!edgeAutoHideState\.pollTimer\) startEdgeCursorPolling\(\);\s*\n\s*reconcileEdgeAutoHide\(\);/,
    'the keeper must re-arm the poll and then reconcile'
  );

  // No focus gate may reappear in the collapse decision path (check the code,
  // not the comment that explains why the gate is absent).
  const pollCode = stripComments(pollFn[0]);
  assert.doesNotMatch(pollCode, /isFocused\(\)/, 'focus must not gate the collapse decision');
  assert.doesNotMatch(pollCode, /\|\|\s*mainWindow\.isFocused\(\)/, 'no focus gate may survive in the collapsed decision');
});

test('an uncaught main-process exception is logged instead of raising a modal dialog', () => {
  const mainSource = readMainSource();
  const controllerSource = readControllerSource();
  assert.match(mainSource, /process\.on\('uncaughtException'/, 'the main process must install an uncaught handler');
  // The registration sits inside a `typeof process.on === 'function'` guard so
  // the hibernation vm fixtures (which slice this region into a sandbox whose
  // `process` stub lacks `.on`) can load the section; allow the indented block.
  const handler = mainSource.match(/process\.on\('uncaughtException',[\s\S]*?\n\s*\}\);/);
  assert.ok(handler, 'the handler must be a single block');
  assert.match(handler[0], /edgeAutoHide\.handleUncaught\(err\)/, 'the handler must forward to the controller');
  const handlerCode = stripComments(handler[0]);
  assert.doesNotMatch(handlerCode, /\bthrow\b/, 'the handler must not re-throw: Electron would still show the modal');
  assert.doesNotMatch(handlerCode, /dialog|showMessageBox/, 'the handler must not open a dialog');
  // The edge recovery body lives in the controller's handleUncaught.
  const recovery = controllerSource.match(/function handleUncaught\(err\) \{[\s\S]*?\n  \}/);
  assert.ok(recovery, 'the controller owns the uncaught recovery body');
  const recoveryCode = stripComments(recovery[0]);
  assert.match(recoveryCode, /edgeLog\(/, 'the recovery must persist the error');
  assert.doesNotMatch(recoveryCode, /\bthrow\b/, 'the recovery must not re-throw: Electron would still show the modal');
  assert.doesNotMatch(recoveryCode, /dialog|showMessageBox/, 'the recovery must not open a dialog');
  assert.match(recoveryCode, /animatingUntil = 0;/, 'the recovery must clear the in-flight deadline so the reconciler can recover');
});

// --- contracts added by the finalize-edge-auto-hide change ------------------

test('the dead edgeExpandedBoundsForSide helper is gone', () => {
  assert.equal(edgeAutoHide.edgeExpandedBoundsForSide, undefined, 'the export must be removed');
  const moduleSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'electron', 'edgeAutoHide.js'), 'utf8');
  assert.doesNotMatch(moduleSource, /edgeExpandedBoundsForSide/, 'no dead code may remain in the module');
});

test('focus alone must not reveal a hidden docked window', () => {
  const controllerSource = readControllerSource();
  const focusHandler = controllerSource.match(/win\.on\('focus', \(\) => \{[\s\S]*?\n    \}\);/);
  assert.ok(focusHandler, 'the focus handler exists');
  const focusCode = stripComments(focusHandler[0]);
  assert.doesNotMatch(focusCode, /expandEdge\(\)/, 'focus must not expand: at startup it popped the restored window out');
  assert.match(focusCode, /scheduleEdgeAutoHide\(\)/, 'focus must still re-arm the cursor poll');
});

test('guarded geometry writes are gated until the window is first shown', () => {
  const controllerSource = readControllerSource();
  const mainSource = readMainSource();
  const guardFn = controllerSource.match(/function setEdgeWindowPosition\(x, y\)[\s\S]*?\n  \}/);
  assert.ok(guardFn, 'setEdgeWindowPosition exists');
  assert.match(
    guardFn[0],
    /if \(!edgeAutoHideState\.geometryReady\) return false;/,
    'the guard must skip writes before the first show'
  );
  // The early skip sits BEFORE the isFinite branch and must not trip the
  // session-wide degrade: guardTripped may only be set by a real rejection.
  const gateIndex = guardFn[0].indexOf('if (!edgeAutoHideState.geometryReady) return false;');
  const finiteIndex = guardFn[0].indexOf('if (!Number.isFinite(x)');
  assert.ok(gateIndex !== -1 && finiteIndex !== -1 && gateIndex < finiteIndex, 'the gate precedes validation');
  assert.match(controllerSource, /edgeAutoHideState\.geometryReady = true;/, 'something must open the gate');
  const showHandler = controllerSource.match(/win\.on\('show'[\s\S]*?\n    \}\);/);
  assert.ok(showHandler, 'the show handler exists');
  assert.match(stripComments(showHandler[0]), /geometryReady = true;/, 'first show opens the gate');
  // The reset must sit in the window-creation path, right after the assignment;
  // upstream's material-lifecycle test owns the line right after `mainWindow = win;`,
  // so only insist the gate reset stays within the same creation neighborhood.
  // (attachWindow carries the reset now that the wiring lives in the controller.)
  assert.match(mainSource, /mainWindow = win;[\s\S]{0,400}?edgeAutoHide\.attachWindow\(win\);/, 'a recreated window must re-earn readiness');
  const attachFn = controllerSource.match(/function attachWindow\(win\) \{[\s\S]*?\n  \}/);
  assert.ok(attachFn, 'attachWindow exists');
  assert.match(attachFn[0], /edgeAutoHideState\.geometryReady = false;/, 'attaching resets readiness');
});

test('startup restore moves the window without imposing the saved size', () => {
  const controllerSource = readControllerSource();
  assert.doesNotMatch(
    controllerSource,
    /setBounds\(saved\.hiddenBounds\)/,
    'the restore must not resurrect the saved width/height over the created size'
  );
  const restoreFn = controllerSource.match(/const created = getWindow\(\)\.getBounds\(\);[\s\S]*?\n        \}\);/);
  assert.ok(restoreFn, 'the restore merges saved position with created size');
  assert.match(restoreFn[0], /width: created\.width/, 'width comes from the created bounds');
  assert.match(restoreFn[0], /height: created\.height/, 'height comes from the created bounds');
});

test('a hidden dock follows resizes via syncEdgeDockGeometry', () => {
  const controllerSource = readControllerSource();
  const syncFn = controllerSource.match(/function syncEdgeDockGeometry\(\)[\s\S]*?\n  \}/);
  assert.ok(syncFn, 'syncEdgeDockGeometry exists');
  const syncCode = stripComments(syncFn[0]);
  assert.match(syncCode, /!edgeAutoHideState\.hidden/, 'it must only reconcile the hidden state');
  assert.match(syncCode, /edgeAutoHideApi\.edgeSnapToBounds\(/, 'expanded geometry is recomputed from the real bounds');
  assert.match(syncCode, /edgeAutoHideApi\.edgeHiddenBounds\(/, 'hidden geometry is recomputed from the new size');
  assert.match(syncCode, /getSettings\(\)\.edgeAutoHideBounds = \{ side/, 'the persisted dock geometry must be refreshed');
  assert.match(syncCode, /setEdgeWindowPosition\(hidden\.x, hidden\.y\)/, 'it moves via the guarded writer, position-only');
  assert.doesNotMatch(syncCode, /\.setBounds\(/, 'it must not resize the window');
  const resizedHandler = controllerSource.match(/win\.on\('resized'[\s\S]*?\n    \}\);/);
  assert.ok(resizedHandler, 'the resized handler exists');
  assert.match(resizedHandler[0], /syncEdgeDockGeometry\(\)/, 'resized events feed the dock sync');
  // 'resized' is silent for programmatic/external resizes on Windows, so the
  // continuous 'resize' event must feed the sync too, debounced.
  const resizeHandler = controllerSource.match(/win\.on\('resize', \(\) => \{[\s\S]*?\n    \}\);/);
  assert.ok(resizeHandler, 'the continuous resize handler exists');
  const resizeCode = stripComments(resizeHandler[0]);
  assert.match(resizeCode, /edgeResizeSyncTimer = setTimeout\(/, 'the resize sync must be debounced');
  assert.match(resizeCode, /syncEdgeDockGeometry\(\)/, 'the debounced sync must call syncEdgeDockGeometry');
});

test('startup restore recomputes the hidden geometry with the current formula', () => {
  const controllerSource = readControllerSource();
  assert.doesNotMatch(
    controllerSource,
    /edgeAutoHideState\.hiddenBounds = saved\.hiddenBounds;/,
    'saved hidden coordinates must not be trusted verbatim: a formula change leaves a stale strip'
  );
  const restoreBlock = controllerSource.match(/const recomputed = edgeAutoHideApi\.edgeHiddenBounds\(saved\.expandedBounds[\s\S]*?\n        \}/);
  assert.ok(restoreBlock, 'the restore recomputes hidden bounds from the saved expanded bounds');
  assert.match(restoreBlock[0], /getSettings\(\)\.edgeAutoHideBounds = /, 'the corrected geometry is persisted back');
});

test('a transient native rejection degrades only after repeated consecutive failures', () => {
  const controllerSource = readControllerSource();
  const guardFn = controllerSource.match(/function setEdgeWindowPosition\(x, y\)[\s\S]*?\n  \}/);
  assert.ok(guardFn, 'setEdgeWindowPosition exists');
  const guardCode = stripComments(guardFn[0]);
  assert.match(guardCode, /nativeRejectStreak >= 3/, 'the session degrade needs repeated consecutive failures');
  assert.match(guardCode, /nativeRejectStreak = 0;/, 'a successful write must clear the streak');
  // Non-finite coordinates remain an immediate degrade: that is a logic bug,
  // and later frames from broken geometry cannot be trusted.
  const finiteBranch = guardFn[0].match(/if \(!Number\.isFinite\(x\)[\s\S]*?\n    \}/);
  assert.ok(finiteBranch, 'the non-finite branch exists');
  assert.match(finiteBranch[0], /guardTripped = true;/, 'non-finite coordinates degrade immediately');
});

test('the tween snaps onto its target instead of playing the asymptotic tail', () => {
  const controllerSource = readControllerSource();
  const animateFn = controllerSource.match(/function animateWindowPosition[\s\S]*?\n  \}/);
  assert.ok(animateFn, 'animateWindowPosition exists');
  assert.match(
    animateFn[0],
    /remaining < 1\)/,
    'the last sub-pixel step must jump straight to the target'
  );
  assert.match(animateFn[0], /setEdgeWindowPosition\(target\.x, target\.y\)/, 'the snap goes through the guard');
});

test('resizing a docked expanded window must never fold it back up', () => {
  const controllerSource = readControllerSource();
  // The hold test carries the interaction margin (the resize border lives
  // outside the Electron rect).
  const pollFn = controllerSource.match(/function startEdgeCursorPolling\(\)[\s\S]*?\n  \}/);
  assert.ok(pollFn, 'startEdgeCursorPolling exists');
  assert.match(
    pollFn[0],
    /edgeCursorInExpandedBounds\(cursor, docked, edgeAutoHideApi\.EDGE_INTERACTION_MARGIN_PX\)/,
    'the expanded-state hold test must use the interaction margin'
  );
  // The hidden-state trigger zone must stay narrow: no margin argument there.
  assert.match(
    pollFn[0],
    /edgeTriggerHitTest\(cursor, expanded, side, display, process\.platform\)/,
    'the trigger hit test must stay margin-free'
  );
  // Resize activity refreshes the grace timestamp in BOTH resize events.
  const resizeHandler = controllerSource.match(/win\.on\('resize', \(\) => \{[\s\S]*?\n    \}\);/);
  assert.ok(resizeHandler, 'the resize handler exists');
  assert.match(resizeHandler[0], /lastResizeAt = Date\.now\(\);/, 'continuous resize feeds the grace');
  const resizedHandler = controllerSource.match(/win\.on\('resized'[\s\S]*?\n    \}\);/);
  assert.ok(resizedHandler, 'the resized handler exists');
  assert.match(resizedHandler[0], /lastResizeAt = Date\.now\(\);/, 'resize end feeds the grace too');
  // Grace vetoes both the arming and the firing of a collapse.
  assert.match(controllerSource, /function edgeResizeGraceActive\(\)/, 'the grace predicate exists');
  const pollCode = stripComments(pollFn[0]);
  assert.match(pollCode, /if \(edgeResizeGraceActive\(\)\) \{\s*\n\s*clearEdgeCollapseTimer\(\);/, 'grace must not arm a collapse');
  const timerBody = pollCode.match(/collapseTimer = setTimeout\(\(\) => \{[\s\S]*?\}, edgeAutoHideApi\.EDGE_COLLAPSE_DELAY_MS\);/);
  assert.ok(timerBody, 'the collapse timer exists');
  assert.match(
    timerBody[0],
    /if \(edgeResizeGraceActive\(\)\) return;/,
    'a collapse firing into an active resize must be vetoed'
  );
});

test('decision logging is opt-in and never on by default', () => {
  const controllerSource = readControllerSource();
  assert.match(
    controllerSource,
    /return getSettings\(\)\?\.edgeAutoHideDebug === true \|\| process\.env\.TOKEN_MONITOR_EDGE_DEBUG === '1';/,
    'the switch is the settings key OR the env var'
  );
  assert.match(controllerSource, /function edgeDebug\(scope, message\)/, 'the debug writer exists');
  assert.match(controllerSource, /'token-monitor-edge-debug\.log'/, 'debug output goes to its own file');
});

test('main.js wires the controller once and no longer owns the state machine', () => {
  const mainSource = readMainSource();
  const controllerSource = readControllerSource();
  assert.match(mainSource, /const \{ createEdgeAutoHideController \} = require\('\.\/edgeAutoHideController'\);/, 'the controller module is required');
  assert.match(mainSource, /const edgeAutoHide = createEdgeAutoHideController\(\{/, 'the controller is constructed once in main.js');
  assert.match(
    mainSource,
    /const \{ scheduleEdgeAutoHide, syncEdgeAutoHideAvailability, syncEdgeDockGeometry, stopEdgeAutoHideTimers, edgeLog, edgeDebug \} = edgeAutoHide;/,
    'existing call sites keep working through the destructured forward'
  );
  for (const gone of [
    /const edgeAutoHideState = /,
    /function startEdgeCursorPolling\(/,
    /function stopEdgeAutoHideTimers\(/,
    /function syncEdgeDockGeometry\(/,
    /function reconcileEdgeAutoHide\(/,
    /function setEdgeWindowPosition\(x, y\)/,
    /function animateWindowPosition\(/,
    /function collapseEdge\(/,
    /function expandEdge\(/,
    /function edgeLog\(/,
    /function edgeDebug\(/
  ]) {
    assert.doesNotMatch(mainSource, gone, 'the state machine must live only in the controller module');
  }
  assert.match(controllerSource, /const edgeAutoHideState = \{ hidden: false, side: null,/, 'the controller owns the state object');
  assert.match(controllerSource, /module\.exports = \{ createEdgeAutoHideController \};/, 'the factory is the module contract');
});

