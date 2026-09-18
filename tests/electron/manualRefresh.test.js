'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createManualRefreshController } = require('../../src/electron/renderer/manualRefresh');

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

test('run() is a no-op while a refresh is already in flight', async () => {
  const gate = deferred();
  const events = [];
  const controller = createManualRefreshController({
    forceRefresh: () => gate.promise,
    apply: (on) => events.push(on ? 'on' : 'off'),
    pull: () => events.push('pull'),
    timeoutMs: 50
  });
  const first = controller.run();
  assert.equal(controller.isBusy(), true);
  assert.equal(await controller.run(), false, 're-entrant run must be refused');
  gate.resolve(true);
  assert.equal(await first, true);
  assert.equal(controller.isBusy(), false);
  assert.deepEqual(events, ['on', 'pull', 'off']);
});

test('successful refresh applies busy chrome, forces collect, then pulls', async () => {
  const order = [];
  const controller = createManualRefreshController({
    forceRefresh: async () => { order.push('force'); return { ok: true }; },
    apply: (on) => order.push(on ? 'chrome-on' : 'chrome-off'),
    pull: async () => { order.push('pull'); },
    timeoutMs: 50
  });
  assert.equal(await controller.run(), true);
  assert.equal(controller.isBusy(), false);
  assert.deepEqual(order, ['chrome-on', 'force', 'pull', 'chrome-off']);
});

test('a hanging force-collect still releases the button at the timeout', async () => {
  const events = [];
  const controller = createManualRefreshController({
    forceRefresh: () => new Promise(() => {}),
    apply: (on) => events.push(on ? 'on' : 'off'),
    pull: () => events.push('pull'),
    timeoutMs: 10
  });
  assert.equal(await controller.run(), true);
  assert.equal(controller.isBusy(), false);
  assert.deepEqual(events, ['on', 'pull', 'off']);
});

test('forceRefresh rejection is swallowed and the data pull still runs', async () => {
  const events = [];
  const controller = createManualRefreshController({
    forceRefresh: () => Promise.reject(new Error('ipc gone')),
    apply: (on) => events.push(on ? 'on' : 'off'),
    pull: () => events.push('pull'),
    timeoutMs: 50
  });
  assert.equal(await controller.run(), true);
  assert.equal(controller.isBusy(), false);
  assert.deepEqual(events, ['on', 'pull', 'off']);
});
