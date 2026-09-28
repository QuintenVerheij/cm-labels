import test from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
let session = {};
let onClicked;
globalThis.chrome = {
  runtime: { id: 'x', getURL: p => `chrome-extension://x/${p}`, onMessage: { addListener() {} } },
  action: { onClicked: { addListener: f => { onClicked = f; } } },
  storage: { session: { get: async () => session } },
  tabs: {
    query: async () => [{ id: 7, windowId: 3 }],
    update: async (id) => { calls.push(['update', id]); },
    reload: async (id) => { calls.push(['reload', id]); },
    create: async () => ({ id: 9 }),
  },
  windows: { update: async () => { calls.push(['focus']); } },
};
await import('../extension/background.js');
const click = async () => { calls.length = 0; await onClicked(); await new Promise(r => setTimeout(r, 10)); };

test('the toolbar button reloads an open app page when no run is live', async () => {
  session = {};
  await click();
  assert.deepEqual(calls.map(c => c[0]), ['update', 'focus', 'reload']);
});

test('the toolbar button focuses but does not reload the app page while a run is live', async () => {
  session = { runLive: Date.now() };
  await click();
  assert.deepEqual(calls.map(c => c[0]), ['update', 'focus']);
});

test('a stale run flag does not block the reload', async () => {
  session = { runLive: Date.now() - 2 * 60 * 60 * 1000 };
  await click();
  assert.ok(calls.some(c => c[0] === 'reload'));
});
