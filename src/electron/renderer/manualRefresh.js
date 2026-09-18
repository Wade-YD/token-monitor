'use strict';

(function exposeManualRefresh(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorManualRefresh = api;
})(typeof window !== 'undefined' ? window : null, function createManualRefreshApi() {

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // One refresh at a time: press -> busy chrome -> force-collect (bounded) ->
  // re-pull data -> release. Transport errors and timeouts both fall through to
  // the pull so the dashboard keeps its last-known-good render either way.
  function createManualRefreshController({ forceRefresh, apply, pull, timeoutMs = 15000 } = {}) {
    let busy = false;

    async function run() {
      if (busy) return false;
      busy = true;
      try {
        apply(true);
        try {
          await Promise.race([
            Promise.resolve(forceRefresh()).catch(() => false),
            delay(timeoutMs)
          ]);
        } catch (_) { /* the pull below must still run */ }
        await Promise.resolve(pull());
      } finally {
        busy = false;
        apply(false);
      }
      return true;
    }

    return { run, isBusy: () => busy };
  }

  return { createManualRefreshController, delay };
});
