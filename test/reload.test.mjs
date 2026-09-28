import test from 'node:test';
import assert from 'node:assert/strict';

const seen = [];
const statuses = ['complete', 'complete', 'loading', 'loading', 'complete'];
globalThis.chrome = {
  tabs: {
    reload: async () => { seen.push('reload'); },
    get: async () => { const s = statuses.shift() ?? 'complete'; seen.push(s); return { status: s }; },
  },
};
const { Tab } = await import('../extension/lib/tabs.js');

test('reload waits for the loading page to complete before returning', async () => {
  await new Tab(1, 'content/pnl.js', '__cmlPNL').reload();
  assert.deepEqual(seen, ['reload', 'complete', 'complete', 'loading', 'loading', 'complete']);
});
