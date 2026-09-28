import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let db;
globalThis.browser = {
  storage: { local: {
    get: async k => (typeof k === 'string' ? (k in db ? { [k]: db[k] } : {}) : { ...db }),
    set: async o => { Object.assign(db, structuredClone(o)); },
    remove: async k => { delete db[k]; },
  } },
  tabs: {}, runtime: {},
};
const { saveRun, getRun, clearRun, purgeStale, runAge, runScope } = await import('../extension/lib/store.js');

const HOUR = 3600 * 1000;
beforeEach(() => { db = {}; });

test('getRun returns a fresh run and keeps it', async () => {
  await saveRun('Paid', { print: [] }, ['1234567890']);
  const r = await getRun();
  assert.deepEqual(r.only, ['1234567890']);
  assert.ok('lastRun' in db);
});

test('getRun removes a run older than 12 hours from storage', async () => {
  db.lastRun = { list: 'Paid', plan: { print: [{ Name: 'Jan' }] }, only: null, loadedAt: new Date(Date.now() - 13 * HOUR).toISOString() };
  assert.equal(await getRun(), null);
  assert.ok(!('lastRun' in db));
});

test('getRun removes a run with an unreadable date', async () => {
  db.lastRun = { list: 'Paid', plan: {}, loadedAt: 'nonsense' };
  assert.equal(await getRun(), null);
  assert.ok(!('lastRun' in db));
});

test('purgeStale removes a print job that was never opened and keeps a new one', async () => {
  db.printJob = { orders: [{}], settings: {}, at: Date.now() - HOUR };
  await purgeStale();
  assert.ok(!('printJob' in db));
  db.printJob = { orders: [{}], settings: {}, at: Date.now() - 1000 };
  await purgeStale();
  assert.ok('printJob' in db);
});

test('purgeStale removes an expired run', async () => {
  db.lastRun = { list: 'Paid', plan: {}, loadedAt: new Date(Date.now() - 20 * HOUR).toISOString() };
  await purgeStale();
  assert.ok(!('lastRun' in db));
});

test('clearRun removes lastRun', async () => {
  await saveRun('Paid', {});
  await clearRun();
  assert.ok(!('lastRun' in db));
});

test('runAge and runScope describe a restored run', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  assert.equal(runAge(new Date(now - 20 * 1000), now), 'just now');
  assert.equal(runAge(new Date(now - 5 * 60000), now), '5 min ago');
  assert.equal(runAge(new Date(now - (3 * 60 + 7) * 60000), now), '3 h 7 min ago');
  assert.equal(runScope(['1', '2', '3'], 'paid orders'), '3 chosen orders');
  assert.equal(runScope(['1'], 'paid orders'), '1 chosen order');
  assert.equal(runScope(null, 'paid orders'), 'paid orders');
});
