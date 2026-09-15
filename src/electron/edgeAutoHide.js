'use strict';

// Edge auto-hide: dock the window to any screen edge. When idle, the window
// slides off-screen leaving only EDGE_VISIBLE_PX visible. Hovering the trigger
// zone slides it back out.

const EDGE_SNAP_THRESHOLD = 12; // px from edge to consider "docked"
const EDGE_VISIBLE_PX = 3; // how many px remain visible when hidden
const EDGE_TRIGGER_ALONG_PADDING = 8; // px margin at each end of the window span
const EDGE_TRIGGER_PERPENDICULAR_TOLERANCE = 12; // generous tolerance perpendicular to edge
const EDGE_COLLAPSE_DELAY_MS = 200;
const EDGE_ANIMATION_DURATION_MS = 180;
// A cursor grabbing a resize border sits on the Win32 OUTER frame, which
// extends ~6px past the rect Electron reports (measured on Win11). The
// expanded-state hold test must treat that band as "still using the window",
// or the window folds back up the moment the user grabs an edge to resize it.
// The hidden-state trigger zone deliberately gets NO such margin: it must
// stay narrow.
const EDGE_INTERACTION_MARGIN_PX = 10;
// Win32 DWM draws invisible resize borders OUTSIDE the rect Electron reports
// (measured on Win11: left/right/bottom +6px, top +0px). A window slid off the
// top/left/right edge keeps those invisible borders on-screen, so the strip
// shows up wider than EDGE_VISIBLE_PX unless the hidden position compensates.
// A bottom dock is cut by the screen's bottom edge itself and needs none.
const EDGE_WIN32_FRAME_OVERHANG_PX = 6;

function getArea(display, platform) {
  if (!display) return null;
  return platform === 'win32' ? display.bounds : display.workArea;
}

// Determine which edge the bounds are docked to, or null if not near any edge.
// Uses display.bounds on win32 (physical screen), display.workArea elsewhere.
function edgeSide(bounds, display, platform = process.platform) {
  if (!bounds || !display) return null;
  const area = getArea(display, platform);
  if (!area) return null;

  const bLeft = Number(bounds.x);
  const bTop = Number(bounds.y);
  const bRight = bLeft + Number(bounds.width);
  const bBottom = bTop + Number(bounds.height);

  const aLeft = Number(area.x);
  const aTop = Number(area.y);
  const aRight = aLeft + Number(area.width);
  const aBottom = aTop + Number(area.height);

  const distLeft = Math.abs(bLeft - aLeft);
  const distTop = Math.abs(bTop - aTop);
  const distRight = Math.abs(bRight - aRight);
  const distBottom = Math.abs(bBottom - aBottom);

  const minDist = Math.min(distLeft, distTop, distRight, distBottom);
  if (minDist > EDGE_SNAP_THRESHOLD) return null;

  // Tie-break priority: top > bottom > left > right (matches typical docking UX)
  if (minDist === distTop) return 'top';
  if (minDist === distBottom) return 'bottom';
  if (minDist === distLeft) return 'left';
  return 'right';
}

// Compute the hidden bounds: window is shifted off-screen leaving only
// EDGE_VISIBLE_PX visible. The window keeps its original size.
function edgeHiddenBounds(expandedBounds, side, display, platform = process.platform) {
  if (!expandedBounds || !side || !display) return null;
  const area = getArea(display, platform);
  if (!area) return null;

  const x = Number(expandedBounds.x);
  const y = Number(expandedBounds.y);
  const width = Number(expandedBounds.width);
  const height = Number(expandedBounds.height);
  const overhang = platform === 'win32' ? EDGE_WIN32_FRAME_OVERHANG_PX : 0;

  switch (side) {
    case 'top':
      // Slide up: bottom EDGE_VISIBLE_PX of window remain at the top screen edge
      return { x, y: Number(area.y) + EDGE_VISIBLE_PX - height - overhang, width, height };
    case 'bottom':
      // Slide down: top EDGE_VISIBLE_PX of window remain at the bottom screen edge
      return { x, y: Number(area.y) + Number(area.height) - EDGE_VISIBLE_PX, width, height };
    case 'left':
      // Slide left: right EDGE_VISIBLE_PX of window remain at the left screen edge
      return { x: Number(area.x) + EDGE_VISIBLE_PX - width - overhang, y, width, height };
    case 'right':
      // Slide right: left EDGE_VISIBLE_PX of window remain at the right screen edge
      return { x: Number(area.x) + Number(area.width) - EDGE_VISIBLE_PX + overhang, y, width, height };
    default:
      return null;
  }
}

// Snap expanded bounds flush to the edge they're nearest to, preserving x/y
// on the non-docked axis.
function edgeSnapToBounds(bounds, side, display, platform = process.platform) {
  if (!bounds || !side || !display) return null;
  const area = getArea(display, platform);
  if (!area) return null;

  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);

  switch (side) {
    case 'top':
      return { x, y: Number(area.y), width, height };
    case 'bottom':
      return { x, y: Number(area.y) + Number(area.height) - height, width, height };
    case 'left':
      return { x: Number(area.x), y, width, height };
    case 'right':
      return { x: Number(area.x) + Number(area.width) - width, y, width, height };
    default:
      return null;
  }
}

// Trigger zone hit test.
// The trigger zone is a strip along the screen edge, constrained to the
// window's own span (with EDGE_TRIGGER_ALONG_PADDING at each end), and
// extending EDGE_TRIGGER_PERPENDICULAR_TOLERANCE px inward from the edge.
// This prevents the entire screen edge from triggering the window.
function edgeTriggerHitTest(cursor, expandedBounds, side, display, platform = process.platform) {
  if (!cursor || !expandedBounds || !side || !display) return false;
  const area = getArea(display, platform);
  if (!area) return false;

  const cursorX = Number(cursor.x);
  const cursorY = Number(cursor.y);
  if (!Number.isFinite(cursorX) || !Number.isFinite(cursorY)) return false;

  const bLeft = Number(expandedBounds.x);
  const bTop = Number(expandedBounds.y);
  const bRight = bLeft + Number(expandedBounds.width);
  const bBottom = bTop + Number(expandedBounds.height);

  let alongCursor, alongMin, alongMax, perpCursor, perpMin, perpMax;

  switch (side) {
    case 'top':
      alongCursor = cursorX;
      alongMin = bLeft + EDGE_TRIGGER_ALONG_PADDING;
      alongMax = bRight - EDGE_TRIGGER_ALONG_PADDING;
      perpCursor = cursorY;
      perpMin = Number(area.y);
      perpMax = Number(area.y) + EDGE_TRIGGER_PERPENDICULAR_TOLERANCE;
      break;
    case 'bottom':
      alongCursor = cursorX;
      alongMin = bLeft + EDGE_TRIGGER_ALONG_PADDING;
      alongMax = bRight - EDGE_TRIGGER_ALONG_PADDING;
      perpCursor = cursorY;
      perpMin = Number(area.y) + Number(area.height) - EDGE_TRIGGER_PERPENDICULAR_TOLERANCE;
      perpMax = Number(area.y) + Number(area.height);
      break;
    case 'left':
      alongCursor = cursorY;
      alongMin = bTop + EDGE_TRIGGER_ALONG_PADDING;
      alongMax = bBottom - EDGE_TRIGGER_ALONG_PADDING;
      perpCursor = cursorX;
      perpMin = Number(area.x);
      perpMax = Number(area.x) + EDGE_TRIGGER_PERPENDICULAR_TOLERANCE;
      break;
    case 'right':
      alongCursor = cursorY;
      alongMin = bTop + EDGE_TRIGGER_ALONG_PADDING;
      alongMax = bBottom - EDGE_TRIGGER_ALONG_PADDING;
      perpCursor = cursorX;
      perpMin = Number(area.x) + Number(area.width) - EDGE_TRIGGER_PERPENDICULAR_TOLERANCE;
      perpMax = Number(area.x) + Number(area.width);
      break;
    default:
      return false;
  }

  return alongCursor >= alongMin && alongCursor <= alongMax &&
    perpCursor >= perpMin && perpCursor <= perpMax;
}

// Check if the cursor is inside the expanded bounds. `margin` widens the test
// rect on all sides (used by the expanded-state hold test so a cursor resting
// on a resize border — outside the Electron rect — still counts as "using it").
function edgeCursorInExpandedBounds(cursor, expandedBounds, margin = 0) {
  if (!cursor || !expandedBounds) return false;
  const m = Number.isFinite(margin) ? Number(margin) : 0;
  const cursorX = Number(cursor.x);
  const cursorY = Number(cursor.y);
  const bLeft = Number(expandedBounds.x);
  const bTop = Number(expandedBounds.y);
  const bRight = bLeft + Number(expandedBounds.width);
  const bBottom = bTop + Number(expandedBounds.height);
  return cursorX >= bLeft - m && cursorX < bRight + m && cursorY >= bTop - m && cursorY < bBottom + m;
}

function canUseEdgeAutoHide(settings = {}) {
  return settings.windowBehavior === 'edge' && settings.trayMode !== true;
}

module.exports = {
  EDGE_SNAP_THRESHOLD,
  EDGE_VISIBLE_PX,
  EDGE_WIN32_FRAME_OVERHANG_PX,
  EDGE_INTERACTION_MARGIN_PX,
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
};
