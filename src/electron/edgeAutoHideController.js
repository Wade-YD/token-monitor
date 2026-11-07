'use strict';

// Edge auto-hide controller: the docked-edge hide/show state machine that used
// to live inline in main.js. Extracted as a behavior-frozen move so upstream
// rebases cannot collide with it: main.js keeps only the factory call, a
// destructured forward of the public entry points, and one-line forwarders in
// createWindow()/applyWindowSettings()/the IPC handlers. Every dependency that
// main.js owns as a reassigned binding (mainWindow, settings, dashboardWindow)
// arrives through a getter in `deps` so the controller always sees live values.

const edgeAutoHideApi = require('./edgeAutoHide');
const edgePopupGuardApi = require('./edgePopupGuard');

function createEdgeAutoHideController(deps) {
  const {
    getWindow,
    getDashboardWindow,
    getSettings,
    saveSettings,
    displayForBounds,
    persistWindowBounds,
    persistBoundsSoon,
    stopTaskbarZOrderKeeper,
    describeWindowBehavior,
    motionPreferenceApi,
    nativeTheme,
    screen,
    windowChrome
  } = deps;

  const edgeAutoHideState = { hidden: false, side: null, expandedBounds: null, hiddenBounds: null, animatingUntil: 0, desired: null, guardTripped: false, geometryReady: false, nativeRejectStreak: 0, lastResizeAt: 0, collapseTimer: null, pollTimer: null };

  function stopEdgeAutoHideTimers() {
    if (edgeAutoHideState.collapseTimer) { clearTimeout(edgeAutoHideState.collapseTimer); edgeAutoHideState.collapseTimer = null; }
    if (edgeAutoHideState.pollTimer) { clearInterval(edgeAutoHideState.pollTimer); edgeAutoHideState.pollTimer = null; }
  }

  function edgeReducedMotion() {
    return motionPreferenceApi.shouldReduceMotion(getSettings()?.reduceMotion, nativeTheme.shouldReduceMotion);
  }

  // While the user is grabbing an edge to resize, the window must never fold
  // back under their hand. Electron exposes no "a native resize drag is active"
  // API, so resize activity is observed through the resize events: a grace window
  // after the last one vetoed every collapse arming/firing.
  const EDGE_RESIZE_GRACE_MS = 700;

  function edgeResizeGraceActive() {
    return Date.now() - edgeAutoHideState.lastResizeAt < EDGE_RESIZE_GRACE_MS;
  }

  // The dashboard is a persistent second window of ours — a workspace the user
  // deliberately works in, unlike the transient native popups the guard exists
  // for. It must never hold the dock open, or the home panel would stay spread
  // over the dashboard until the app restarted. Any future persistent window
  // (a widget, a separate editor) belongs on this same list.
  function edgePersistentWindowHwnds() {
    if (!getDashboardWindow() || getDashboardWindow().isDestroyed()) return [];
    try {
      const hwnd = edgePopupGuardApi.hwndOf(getDashboardWindow());
      return hwnd ? [hwnd] : [];
    } catch (_) {
      return [];
    }
  }

  // Native popups we spawn (the vendor-color chooser, context menus, <select>
  // dropdowns) are windows of our own process OUTSIDE the BrowserWindow rect.
  // While the cursor is on one of them — or one holds focus — the docked window
  // must not fold, or the user loses the popup mid-interaction. win32 only; the
  // guard degrades to false everywhere else and when the FFI is unavailable.
  function edgeNativePopupHoldsCursor(cursor) {
    if (process.platform !== 'win32' || !getWindow() || getWindow().isDestroyed()) return false;
    try {
      // Electron screen APIs speak DIPs; WindowFromPoint speaks physical pixels.
      // Convert when the scales differ (identity at 100% zoom).
      let physical = cursor;
      try {
        if (typeof screen.dipToScreenPoint === 'function') physical = screen.dipToScreenPoint(cursor);
      } catch (_) {}
      return edgePopupGuardApi.popupHoldsCollapse({
        mainHwnd: edgePopupGuardApi.hwndOf(getWindow()),
        cursor: physical,
        persistentHwnds: edgePersistentWindowHwnds(),
        debug: (m) => edgeDebug('popup', 'cursor=' + JSON.stringify(cursor) + ' physical=' + JSON.stringify(physical) + ' | ' + m)
      });
    } catch (err) {
      edgeDebug('popup', 'guard threw: ' + ((err && err.message) || String(err)));
      return false;
    }
  }

  // ---- Edge geometry guard -------------------------------------------------
  // No non-finite coordinate may ever reach an Electron window API (a NaN reaches
  // setPosition as "Error processing argument at index 1, conversion failure" and
  // surfaces as a modal crash dialog). A rejected frame is logged verbatim, once,
  // so the next occurrence is self-diagnosing instead of needing a re-probe.
  function edgeLog(scope, message, file = 'token-monitor-edge-error.log') {
    try {
      require('fs').appendFileSync(
        require('path').join(require('os').tmpdir(), file),
        new Date().toISOString() + ' [' + scope + '] ' + message + '\n');
    } catch (_) { /* logging must never throw */ }
  }

  // Decision-path logging is opt-in: enabled via settings.edgeAutoHideDebug or
  // TOKEN_MONITOR_EDGE_DEBUG=1, writing to a separate debug log so the error
  // log keeps its "only written on a failure" contract.
  function edgeDebugEnabled() {
    return getSettings()?.edgeAutoHideDebug === true || process.env.TOKEN_MONITOR_EDGE_DEBUG === '1';
  }

  function edgeDebug(scope, message) {
    if (!edgeDebugEnabled()) return;
    edgeLog(scope, message, 'token-monitor-edge-debug.log');
  }

  function edgeGuardTripped() {
    return edgeAutoHideState.guardTripped === true;
  }

  // An "in flight" marker must expire on its own. A boolean cleared only by the
  // animation's success path is what previously wedged auto-hide forever: one
  // thrown frame left the flag set, the cursor poll early-returned on it, and the
  // window never hid again.
  function edgeIsAnimating() {
    return Date.now() < edgeAutoHideState.animatingUntil;
  }

  function edgeAnimationDuration(duration) {
    // Once a frame has been rejected we no longer trust animated frames, so the
    // rest of the session jumps instead of tweening.
    return edgeGuardTripped() ? 0 : duration;
  }

  function setEdgeWindowPosition(x, y) {
    if (!getWindow() || getWindow().isDestroyed()) return false;
    // Before the first show the native layer can reject even finite positions.
    // Skipping silently is not an error: the watchdog and the cursor poll
    // converge the geometry once the window is shown, so this must not trip the
    // session-wide animation degrade.
    if (!edgeAutoHideState.geometryReady) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (!edgeGuardTripped()) {
        edgeAutoHideState.guardTripped = true;
        edgeLog('geometry-guard', 'refused a non-finite position: x=' + String(x)
          + ' y=' + String(y) + ' -- tweening disabled for this session');
      }
      return false;
    }
    try {
      getWindow().setPosition(x, y, false);
    } catch (err) {
      // Defensive: the native layer has been observed to intermittently reject a
      // call whose coordinates we already verified (an occasional late tween
      // frame; the same call succeeds on the next transition). That is transient,
      // so it degrades the session to instant-only moves only after REPEATED
      // consecutive failures -- one flaky frame must not cost the whole session
      // its animation. (The startup class of rejections is prevented upstream by
      // the geometryReady gate, so what survives to here is rare and transient.)
      // Never let it escape as an uncaught exception: Electron would surface it
      // as a modal dialog.
      edgeAutoHideState.nativeRejectStreak += 1;
      edgeLog('geometry-guard', 'native setPosition rejected a finite position: x=' + String(x)
        + ' y=' + String(y) + ' err=' + ((err && err.message) || String(err))
        + ' streak=' + edgeAutoHideState.nativeRejectStreak);
      if (edgeAutoHideState.nativeRejectStreak >= 3) {
        edgeAutoHideState.guardTripped = true;
        edgeLog('geometry-guard', 'repeated native rejections -- tweening disabled for this session');
      }
      return false;
    }
    edgeAutoHideState.nativeRejectStreak = 0;
    return true;
  }

  function animateWindowPosition(from, to, duration, onComplete) {
    if (!getWindow() || getWindow().isDestroyed()) { if (onComplete) onComplete(); return; }
    const target = to && Number.isFinite(to.x) && Number.isFinite(to.y) ? to : null;
    const source = from && Number.isFinite(from.x) && Number.isFinite(from.y) ? from : null;
    if (!target) {
      setEdgeWindowPosition(to ? to.x : undefined, to ? to.y : undefined);
      if (onComplete) onComplete();
      return;
    }
    const effective = edgeAnimationDuration(duration);
    if (!source || edgeReducedMotion() || effective <= 0) {
      setEdgeWindowPosition(target.x, target.y);
      if (onComplete) onComplete();
      return;
    }
    edgeAutoHideState.animatingUntil = Date.now() + effective + 100;
    const startTime = Date.now();
    const interval = 16; // ~60fps
    function tick() {
      if (!getWindow() || getWindow().isDestroyed()) { edgeAutoHideState.animatingUntil = 0; return; }
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / effective);
      // Cubic ease-out: 1 - (1-t)^3
      const eased = 1 - Math.pow(1 - t, 3);
      const x = Math.round(source.x + (target.x - source.x) * eased);
      const y = Math.round(source.y + (target.y - source.y) * eased);
      // Snap straight onto the target instead of tweening the asymptotic tail:
      // the sub-pixel frames add nothing visually, and the native layer has been
      // observed to intermittently reject exactly such a late frame.
      const remaining = Math.max(Math.abs(target.x - x), Math.abs(target.y - y));
      if (t >= 1 || remaining < 1) {
        if (!setEdgeWindowPosition(target.x, target.y)) {
          edgeDebug('animate', 'final frame rejected to=' + JSON.stringify(target));
        }
        edgeAutoHideState.animatingUntil = 0;
        if (onComplete) onComplete();
        return;
      }
      if (!setEdgeWindowPosition(x, y)) {
        edgeDebug('animate', 'frame rejected from=' + JSON.stringify(source) + ' to=' + JSON.stringify(target));
        edgeAutoHideState.animatingUntil = 0;
        if (onComplete) onComplete();
        return;
      }
      setTimeout(tick, interval);
    }
    tick();
  }

  function collapseEdge(expandedBounds, side) {
    if (!getWindow() || getWindow().isDestroyed() || !expandedBounds || !side) return false;
    stopEdgeAutoHideTimers();
    const display = displayForBounds(expandedBounds);
    if (!display) return false;
    const hidden = edgeAutoHideApi.edgeHiddenBounds(expandedBounds, side, display, process.platform);
    if (!hidden) return false;
    edgeDebug('collapse', 'side=' + side + ' from=' + JSON.stringify(getWindow().getBounds()) + ' to=' + JSON.stringify(hidden));
    edgeAutoHideState.hidden = true;
    edgeAutoHideState.desired = 'hidden';
    edgeAutoHideState.side = side;
    edgeAutoHideState.expandedBounds = expandedBounds;
    edgeAutoHideState.hiddenBounds = hidden;
    getSettings().edgeAutoHideBounds = { side, expandedBounds, hiddenBounds: hidden };
    saveSettings();
    const current = getWindow().getBounds();
    animateWindowPosition(current, hidden, edgeAutoHideApi.EDGE_ANIMATION_DURATION_MS, () => {
      startEdgeCursorPolling();
    });
    return true;
  }

  function expandEdge() {
    if (!getWindow() || getWindow().isDestroyed() || !edgeAutoHideState.hidden) return false;
    stopEdgeAutoHideTimers();
    const expanded = edgeAutoHideState.expandedBounds;
    if (!expanded) return false;
    edgeDebug('expand', 'side=' + edgeAutoHideState.side + ' from=' + JSON.stringify(getWindow().getBounds()) + ' to=' + JSON.stringify(expanded));
    edgeAutoHideState.hidden = false;
    edgeAutoHideState.desired = 'revealed';
    const current = getWindow().getBounds();
    animateWindowPosition(current, expanded, edgeAutoHideApi.EDGE_ANIMATION_DURATION_MS, () => {
      // Re-arm the cursor poll FIRST. expandEdge() already stopped the poll, and the
      // poll is the only thing that can ever hide the window again -- so a throw from
      // the persistence call below must not be able to skip it, or the window would
      // stay revealed forever with no timer left to collapse it.
      scheduleEdgeAutoHide();
      // Persist whatever bounds the window actually ended at: the user may have
      // resized while expanded, so state.expandedBounds alone can be stale.
      if (getWindow() && !getWindow().isDestroyed()) {
        try {
          persistWindowBounds(getWindow().getBounds());
        } catch (err) {
          try {
            require('fs').appendFileSync(
              require('path').join(require('os').tmpdir(), 'token-monitor-edge-error.log'),
              new Date().toISOString() + ' expandEdge persist failed: ' + (err && err.stack || err) + '\n');
          } catch (_) { /* a logging failure must never break the hide/show chain */ }
        }
      }
    });
    return true;
  }

  // The cursor poll owns every hide/show transition; this entry point just (re)arms
  // it, so blur/mode-switch/drag-release paths cannot race the poll into collapsing
  // the window underneath the user's cursor.
  function scheduleEdgeAutoHide() {
    if (!canUseEdgeAutoHide(getSettings())) return;
    startEdgeCursorPolling();
  }

  // Keep state.expandedBounds in sync while the window sits expanded and docked,
  // so re-hiding and re-expanding never animate to a stale size or position.
  function trackEdgeExpandedBounds() {
    if (edgeIsAnimating() || edgeAutoHideState.hidden || !edgeAutoHideState.side) return;
    if (!canUseEdgeAutoHide(getSettings()) || !getWindow() || getWindow().isDestroyed()) return;
    edgeAutoHideState.expandedBounds = getWindow().getBounds();
  }

  // While HIDDEN, the window can be resized underneath us (display/DPI change or
  // a programmatic resize). The remembered dock geometry must follow the new
  // size, or the strip width drifts and the next start restores a stale size.
  // Deliberately hidden-state only: while expanded the user may be mid-drag on
  // an edge, and snapping the dock axis under their hand would fight the drag.
  function syncEdgeDockGeometry() {
    if (!canUseEdgeAutoHide(getSettings()) || edgeIsAnimating() || !edgeAutoHideState.hidden) return;
    if (!edgeAutoHideState.side || !getWindow() || getWindow().isDestroyed()) return;
    const current = getWindow().getBounds();
    const display = displayForBounds(current);
    if (!display) return;
    const side = edgeAutoHideState.side;
    const expanded = edgeAutoHideApi.edgeSnapToBounds(current, side, display, process.platform);
    const hidden = expanded && edgeAutoHideApi.edgeHiddenBounds(expanded, side, display, process.platform);
    if (!expanded || !hidden) return;
    edgeAutoHideState.expandedBounds = expanded;
    edgeAutoHideState.hiddenBounds = hidden;
    getSettings().edgeAutoHideBounds = { side, expandedBounds: expanded, hiddenBounds: hidden };
    saveSettings();
    setEdgeWindowPosition(hidden.x, hidden.y);
    edgeDebug('resize-sync', 'side=' + side + ' bounds=' + JSON.stringify(hidden));
  }

  function clearEdgeCollapseTimer() {
    if (edgeAutoHideState.collapseTimer) {
      clearTimeout(edgeAutoHideState.collapseTimer);
      edgeAutoHideState.collapseTimer = null;
    }
  }

  // The one and only executor for every hide/show transition. It is idempotent:
  // it compares the desired state against the real window geometry and only moves
  // when the two disagree. A lost timer or a killed poll therefore cannot strand the
  // window -- the next reconcile simply re-discovers the drift and corrects it.
  function reconcileEdgeAutoHide() {
    if (!canUseEdgeAutoHide(getSettings())) return false;
    if (!getWindow() || getWindow().isDestroyed() || !getWindow().isVisible()) return false;
    if (edgeIsAnimating()) return false;
    const desired = edgeAutoHideState.desired;
    if (desired === 'hidden') {
      if (edgeAutoHideState.hidden) return false;
      const bounds = getWindow().getBounds();
      const display = displayForBounds(bounds);
      if (!display) return false;
      const side = edgeAutoHideState.side || edgeAutoHideApi.edgeSide(bounds, display, process.platform);
      if (!side) return false;
      const snapped = edgeAutoHideApi.edgeSnapToBounds(bounds, side, display, process.platform);
      return collapseEdge(snapped, side);
    }
    if (desired === 'revealed') {
      if (!edgeAutoHideState.hidden) return false;
      return expandEdge();
    }
    return false;
  }

  // The cursor poll only DECIDES the desired state; it never moves the window
  // itself. Keeping a single executor means no stray stopTimer() can leave the
  // window with nothing left to hide it.
  function startEdgeCursorPolling() {
    stopEdgeAutoHideTimers();
    if (!canUseEdgeAutoHide(getSettings())) return;
    if (typeof screen.getCursorScreenPoint !== 'function') return;
    edgeAutoHideState.pollTimer = setInterval(() => {
      if (!getWindow() || getWindow().isDestroyed() || edgeIsAnimating()) return;
      if (!getWindow().isVisible()) return;
      if (!canUseEdgeAutoHide(getSettings())) { stopEdgeAutoHideTimers(); return; }
      let cursor;
      try { cursor = screen.getCursorScreenPoint(); } catch (_) { return; }
      const expanded = edgeAutoHideState.expandedBounds;
      const side = edgeAutoHideState.side;
      if (edgeAutoHideState.hidden) {
        if (!expanded || !side) return;
        const display = displayForBounds(expanded);
        if (!display) return;
        // Hidden state: only the slim strip zone (edge ± perpendicular tolerance,
        // constrained along the window's own span) may reveal the window. The full
        // expanded rect must NOT trigger, or sweeping the cursor across the middle
        // of the screen would pull the window out.
        if (edgeAutoHideApi.edgeTriggerHitTest(cursor, expanded, side, display, process.platform)) {
          edgeDebug('poll', 'hidden hit side=' + side + ' cursor=' + JSON.stringify(cursor));
          clearEdgeCollapseTimer();
          edgeAutoHideState.desired = 'revealed';
          reconcileEdgeAutoHide();
        }
        return;
      }
      // Expanded state (docked, or merely parked near an edge). Deliberately no
      // isFocused() gate: this window is focusable and keeps focus for long
      // stretches, so gating on focus meant the collapse never armed. The cursor
      // check alone already expresses "do not hide while the user is using it".
      const bounds = getWindow().getBounds();
      const display = displayForBounds(bounds);
      if (!display) return;
      const dockSide = side || edgeAutoHideApi.edgeSide(bounds, display, process.platform);
      if (!dockSide) { clearEdgeCollapseTimer(); return; }
      const docked = edgeAutoHideApi.edgeSnapToBounds(bounds, dockSide, display, process.platform);
      // A cursor grabbing a resize border sits on the Win32 outer frame, OUTSIDE
      // the Electron rect — without the interaction margin the window folded
      // back up mid-resize, every single time.
      if (edgeAutoHideApi.edgeCursorInExpandedBounds(cursor, docked, edgeAutoHideApi.EDGE_INTERACTION_MARGIN_PX)) {
        clearEdgeCollapseTimer();
        edgeAutoHideState.desired = 'revealed';
        return;
      }
      if (edgeResizeGraceActive()) {
        // Resizing was seen moments ago: the cursor may have drifted past the
        // margin while the user still holds an edge. Never arm a collapse here.
        clearEdgeCollapseTimer();
        return;
      }
      if (edgeNativePopupHoldsCursor(cursor)) {
        // The cursor sits on one of our own native popups (vendor-color chooser,
        // context menu, <select>) — part of the interaction, not "the user left".
        clearEdgeCollapseTimer();
        edgeAutoHideState.desired = 'revealed';
        edgeDebug('poll', 'popup hold cursor=' + JSON.stringify(cursor));
        return;
      }
      if (!edgeAutoHideState.collapseTimer) {
        edgeDebug('poll', 'arm collapse side=' + dockSide + ' cursor=' + JSON.stringify(cursor));
        edgeAutoHideState.collapseTimer = setTimeout(() => {
          edgeAutoHideState.collapseTimer = null;
          if (!canUseEdgeAutoHide(getSettings())) return;
          // The user may have grabbed an edge or opened a popup after this timer
          // was armed; a collapse firing into either is a UX betrayal (and a
          // known source of transient native rejections).
          if (edgeResizeGraceActive()) return;
          let cursorNow = null;
          try { cursorNow = screen.getCursorScreenPoint(); } catch (_) { cursorNow = null; }
          if (cursorNow && edgeNativePopupHoldsCursor(cursorNow)) {
            edgeDebug('poll', 'collapse vetoed by popup at cursor=' + JSON.stringify(cursorNow));
            return;
          }
          // The grace period only flips the desired state; the move itself stays
          // with the single executor, so it remains subject to the geometry guard.
          edgeAutoHideState.desired = 'hidden';
          reconcileEdgeAutoHide();
        }, edgeAutoHideApi.EDGE_COLLAPSE_DELAY_MS);
      }
    }, 100); // Poll every 100ms
  }

  function maybeCollapseEdge(bounds) {
    if (!canUseEdgeAutoHide(getSettings()) || edgeAutoHideState.hidden) return false;
    const display = displayForBounds(bounds);
    if (!display) return false;
    const side = edgeAutoHideApi.edgeSide(bounds, display, process.platform);
    if (!side) return false;
    const snapped = edgeAutoHideApi.edgeSnapToBounds(bounds, side, display, process.platform);
    return collapseEdge(snapped, side);
  }

  function canUseEdgeAutoHide(source = getSettings()) {
    return edgeAutoHideApi.canUseEdgeAutoHide(source);
  }

  function syncEdgeAutoHideAvailability() {
    if (!canUseEdgeAutoHide(getSettings())) {
      if (edgeAutoHideState.hidden) expandEdge();
      else {
        edgeAutoHideState.side = null;
        edgeAutoHideState.expandedBounds = null;
        edgeAutoHideState.hiddenBounds = null;
        stopEdgeAutoHideTimers();
      }
      return;
    }
    // If switching to edge mode and window is near an edge, collapse it
    if (getWindow() && !getWindow().isDestroyed() && !edgeAutoHideState.hidden) {
      const bounds = getWindow().getBounds();
      const display = displayForBounds(bounds);
      if (display) {
        const side = edgeAutoHideApi.edgeSide(bounds, display, process.platform);
        if (side) {
          scheduleEdgeAutoHide();
        }
      }
    }
  }

  // ---- Integration surface (wiring moved verbatim out of main.js) ----------

  // Registers the edge-related window event listeners that used to be inlined in
  // createWindow(). The non-edge increments (floating-bubble timer stop on focus,
  // popover/blur gating, 'restore'/'minimize' taskbar hooks) stay in main.js.
  function attachWindow(win) {
    edgeAutoHideState.geometryReady = false;
    win.on('focus', () => {
      stopEdgeAutoHideTimers();
      // Deliberately NO expandEdge() here. The cursor trigger owns reveal: a
      // focus gain without the cursor at the edge must not pop the window out,
      // and at startup the automatic focus fired this path against the freshly
      // restored hidden window — a native setPosition rejection on every launch,
      // which also tripped the session-wide animation degrade. The poll is all
      // the reveal path needs (clicking the strip is inside the trigger zone).
      scheduleEdgeAutoHide();
    });
    // 'resized' only fires for interactive drags; external/programmatic resizes
    // (observed with an external MoveWindow) leave it silent on Windows. The
    // hidden-state dock sync therefore also watches the continuous 'resize'
    // event, debounced so a resize burst settles first.
    let edgeResizeSyncTimer = null;
    win.on('resize', () => {
      edgeAutoHideState.lastResizeAt = Date.now();
      if (!edgeAutoHideState.hidden) return;
      if (edgeResizeSyncTimer) clearTimeout(edgeResizeSyncTimer);
      edgeResizeSyncTimer = setTimeout(() => {
        edgeResizeSyncTimer = null;
        syncEdgeDockGeometry();
      }, 200);
    });
    win.on('resized', () => {
      edgeAutoHideState.lastResizeAt = Date.now();
      persistBoundsSoon();
      windowChrome.syncTaskbarZOrder();
      trackEdgeExpandedBounds();
      syncEdgeDockGeometry();
    });
    win.on('moved', () => {
      persistBoundsSoon();
      windowChrome.syncTaskbarZOrder();
      // Programmatic animation frames land here too; only react to real drags.
      if (edgeIsAnimating() || !getWindow() || getWindow().isDestroyed()) return;
      if (!canUseEdgeAutoHide(getSettings()) || edgeAutoHideState.hidden) return;
      const bounds = getWindow().getBounds();
      const display = displayForBounds(bounds);
      if (!display) return;
      const side = edgeAutoHideApi.edgeSide(bounds, display, process.platform);
      if (side) {
        // Window was dropped near an edge: arm the cursor poll, which re-hides it
        // after the grace delay — never while the cursor rests on the window.
        scheduleEdgeAutoHide();
      } else if (edgeAutoHideState.side || getSettings().edgeAutoHideBounds) {
        // Dragged away from every edge: forget the remembered dock so a later
        // restart cannot yank the window back to a stale hidden position.
        edgeAutoHideState.side = null;
        edgeAutoHideState.expandedBounds = null;
        edgeAutoHideState.hiddenBounds = null;
        if (edgeAutoHideState.collapseTimer) {
          clearTimeout(edgeAutoHideState.collapseTimer);
          edgeAutoHideState.collapseTimer = null;
        }
        if (getSettings().edgeAutoHideBounds) {
          delete getSettings().edgeAutoHideBounds;
          saveSettings();
        }
      }
    });
    win.on('show', () => {
      // Geometry writes through the guard become legal only once the window has
      // actually been shown; a window recreated later must re-earn this.
      edgeAutoHideState.geometryReady = true;
      windowChrome.syncTaskbarZOrder();
      scheduleEdgeAutoHide();
    });
    win.on('hide', () => { stopTaskbarZOrderKeeper(); stopEdgeAutoHideTimers(); });
  }

  // The non-edge head of main.js applyWindowSettings() (the !mainWindow guard and
  // the collapsed-floating-bubble early return) stays in main.js; everything from
  // here on is the verbatim remainder, including the general behavior path that
  // the edge branches early-return past.
  function applyWindowSettings() {
    // Edge auto-hide: restore a saved hidden dock exactly once per session, before
    // any in-session edge state exists (edgeAutoHideState.side === null). Without
    // that guard, every applyWindowSettings() call (e.g. any settings change made
    // while the user is actively using the expanded window) would yank the window
    // back off-screen. Saved bounds are validated against the current displays so
    // an unplugged monitor cannot strand the window off-screen.
    if (canUseEdgeAutoHide(getSettings()) && edgeAutoHideState.side === null && !edgeAutoHideState.hidden && getSettings().edgeAutoHideBounds) {
      const saved = getSettings().edgeAutoHideBounds;
      if (saved.side && saved.expandedBounds && saved.hiddenBounds
        && displayForBounds(saved.expandedBounds) && displayForBounds(saved.hiddenBounds)) {
        edgeAutoHideState.hidden = true;
        edgeAutoHideState.side = saved.side;
        edgeAutoHideState.expandedBounds = saved.expandedBounds;
        // Recompute the hidden geometry with the CURRENT formula instead of
        // trusting the saved coordinates: the formula can change between builds
        // (e.g. the win32 frame-overhang compensation), and a stale saved y left
        // a 9px strip showing until the first re-hide.
        const restoreDisplay = displayForBounds(saved.expandedBounds);
        const recomputed = edgeAutoHideApi.edgeHiddenBounds(saved.expandedBounds, saved.side, restoreDisplay, process.platform);
        edgeAutoHideState.hiddenBounds = recomputed || saved.hiddenBounds;
        if (recomputed) {
          getSettings().edgeAutoHideBounds = { side: saved.side, expandedBounds: saved.expandedBounds, hiddenBounds: recomputed };
          saveSettings();
        }
        // Move to the hidden POSITION only: the window was just created with the
        // size from windowBounds (which carries the user's latest resize), and
        // forcing the saved width/height here would resurrect a stale size over
        // it. No animation on startup.
        const created = getWindow().getBounds();
        const restoreTarget = edgeAutoHideState.hiddenBounds;
        getWindow().setBounds({
          x: restoreTarget.x,
          y: restoreTarget.y,
          width: created.width,
          height: created.height
        });
        edgeDebug('restore', 'side=' + saved.side + ' hidden=' + JSON.stringify(restoreTarget) + ' size=' + created.width + 'x' + created.height);
        getWindow().setAlwaysOnTop(true, windowChrome.floatingAlwaysOnTopLevel());
        if (typeof getWindow().setMovable === 'function') getWindow().setMovable(true);
        if (typeof getWindow().setResizable === 'function') getWindow().setResizable(true);
        // A maximizable window lets Windows 11's Aero Snap win a drag toward the
        // top edge: the drop maximizes instead of docking, and the top dock can
        // never engage (left/right survive because their tiled results still sit
        // on an edge). Non-maximizable windows are exempt from drag snapping.
        if (typeof getWindow().setMaximizable === 'function') getWindow().setMaximizable(false);
        if (typeof getWindow().setIgnoreMouseEvents === 'function') getWindow().setIgnoreMouseEvents(false);
        if (typeof getWindow().setFocusable === 'function') getWindow().setFocusable(true);
        if (typeof getWindow().setSkipTaskbar === 'function') getWindow().setSkipTaskbar(windowChrome.skipTaskbarForSettings(getSettings()));
        windowChrome.syncTaskbarZOrder();
        startEdgeCursorPolling();
        return;
      }
    }
    if (edgeAutoHideState.hidden && canUseEdgeAutoHide(getSettings())) {
      // Edge auto-hide hidden state: keep window at hidden position. Mode-guarded
      // so switching away from edge mode can never strand the window off-screen.
      // Position-only: keep the current size, same reasoning as the startup path.
      if (edgeAutoHideState.hiddenBounds) {
        const kept = getWindow().getBounds();
        getWindow().setBounds({
          x: edgeAutoHideState.hiddenBounds.x,
          y: edgeAutoHideState.hiddenBounds.y,
          width: kept.width,
          height: kept.height
        });
      }
      getWindow().setAlwaysOnTop(true, windowChrome.floatingAlwaysOnTopLevel());
      if (typeof getWindow().setMovable === 'function') getWindow().setMovable(true);
      if (typeof getWindow().setResizable === 'function') getWindow().setResizable(true);
      // Same Aero-Snap guard as the startup path above.
      if (typeof getWindow().setMaximizable === 'function') getWindow().setMaximizable(false);
      if (typeof getWindow().setIgnoreMouseEvents === 'function') getWindow().setIgnoreMouseEvents(false);
      if (typeof getWindow().setFocusable === 'function') getWindow().setFocusable(true);
      if (typeof getWindow().setSkipTaskbar === 'function') getWindow().setSkipTaskbar(windowChrome.skipTaskbarForSettings(getSettings()));
      windowChrome.syncTaskbarZOrder();
      startEdgeCursorPolling();
      return;
    }
    const behavior = describeWindowBehavior(getSettings());
    getWindow().setAlwaysOnTop(behavior.alwaysOnTop, windowChrome.floatingAlwaysOnTopLevel());
    if (typeof getWindow().setMovable === 'function') getWindow().setMovable(behavior.draggable);
    if (typeof getWindow().setResizable === 'function') getWindow().setResizable(behavior.resizable);
    // Edge mode must not be maximizable: Windows 11 claims a drag toward the top
    // edge for its own maximize, which starves the top dock. Restore the flag in
    // every other mode so behavior switches keep the window maximizable.
    if (typeof getWindow().setMaximizable === 'function') getWindow().setMaximizable(behavior.mode !== 'edge');
    if (typeof getWindow().setIgnoreMouseEvents === 'function') {
      getWindow().setIgnoreMouseEvents(behavior.mousePassthrough);
    }
    if (typeof getWindow().setFocusable === 'function') getWindow().setFocusable(behavior.focusable);
    if (typeof getWindow().setSkipTaskbar === 'function') getWindow().setSkipTaskbar(windowChrome.skipTaskbarForSettings(getSettings()));
    if (!behavior.focusable && typeof getWindow().blur === 'function') getWindow().blur();
    windowChrome.syncTaskbarZOrder();
    // If switching to edge mode, schedule auto-hide if near edge
    if (behavior.mode === 'edge') {
      scheduleEdgeAutoHide();
    } else {
      stopEdgeAutoHideTimers();
      // Clear edge state when leaving edge mode
      if (getSettings().edgeAutoHideBounds) {
        delete getSettings().edgeAutoHideBounds;
        saveSettings();
      }
    }
  }

  // Body of main.js' uncaughtException handler (edge portion). Called from the
  // process-level handler that stays in main.js.
  function handleUncaught(err) {
    try {
      edgeLog('uncaught', (err && err.stack) || String(err));
    } catch (_) { /* logging must never throw */ }
    try {
      edgeAutoHideState.animatingUntil = 0;
      edgeAutoHideState.guardTripped = true;
      clearEdgeCollapseTimer();
      if (edgeAutoHideState.desired === 'hidden') reconcileEdgeAutoHide();
    } catch (_) { /* recovery must never throw */ }
  }

  // Body of the slow keeper interval in main.js (app.whenReady): re-arms the
  // poll when it is missing and then reconciles.
  function keeperTick() {
    if (!canUseEdgeAutoHide(getSettings())) return;
    if (!getWindow() || getWindow().isDestroyed() || !getWindow().isVisible()) return;
    if (!edgeAutoHideState.pollTimer) startEdgeCursorPolling();
    reconcileEdgeAutoHide();
  }

  // Body of the 'edgeAutoHide:expand' IPC handler in main.js.
  function expand() {
    return expandEdge();
  }

  // Body of the 'edgeAutoHide:collapse' IPC handler in main.js.
  function collapse() {
    if (!getWindow() || getWindow().isDestroyed() || !canUseEdgeAutoHide(getSettings())) return false;
    if (edgeAutoHideState.hidden) return true;
    const bounds = getWindow().getBounds();
    return maybeCollapseEdge(bounds);
  }

  // Predicate for main.js persistBoundsSoon(): the dock is hidden and its
  // expanded bounds are tracked, so hidden geometry must not reach windowBounds.
  function isHiddenWithExpandedBounds() {
    return edgeAutoHideState.hidden && edgeAutoHideState.expandedBounds;
  }

  return {
    scheduleEdgeAutoHide,
    syncEdgeAutoHideAvailability,
    syncEdgeDockGeometry,
    stopEdgeAutoHideTimers,
    edgeLog,
    edgeDebug,
    applyWindowSettings,
    attachWindow,
    handleUncaught,
    keeperTick,
    expand,
    collapse,
    isHiddenWithExpandedBounds
  };
}

module.exports = { createEdgeAutoHideController };
