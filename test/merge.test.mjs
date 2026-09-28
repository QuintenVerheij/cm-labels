import test from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.window = globalThis;
globalThis.location = { pathname: '/nl/verzenden' };
globalThis.document = { querySelector: () => null, querySelectorAll: () => [] };
globalThis.sessionStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
await import('../extension/content/pnl.js');

const cartOf = ids => JSON.stringify({ ids, activeIds: [ids[0]], entities: Object.fromEntries(ids.map(id => [String(id), { id, name: `e${id}` }])) });
const merge = others => window.__cmlPNL.mergeOrders(others);

test('mergeOrders appends the other carts with new ids', () => {
  store['current-order'] = cartOf([0]);
  assert.equal(merge([cartOf([0]), cartOf([0, 1])]), 4);
  const a = JSON.parse(store['current-order']);
  assert.deepEqual(a.ids, [0, 1, 2, 3]);
  assert.deepEqual(a.activeIds, [3]);
});

test('mergeOrders throws a readable error for a missing or invalid current-order', () => {
  delete store['current-order'];
  assert.throws(() => merge([cartOf([0])]), /no valid PostNL cart/);
  store['current-order'] = 'not json';
  assert.throws(() => merge([]), /no valid PostNL cart/);
});

test('mergeOrders throws for a null or invalid other cart and leaves the base cart untouched', () => {
  store['current-order'] = cartOf([0]);
  for (const bad of [null, 'not json', '{}']) {
    assert.throws(() => merge([cartOf([0]), bad]), /tab 3 has no valid PostNL cart/);
    assert.equal(store['current-order'], cartOf([0]));
  }
});
