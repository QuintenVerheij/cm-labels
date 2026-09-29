import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let db = {};
globalThis.browser = {
  storage: { local: {
    get: async k => (typeof k === 'string' ? (k in db ? { [k]: db[k] } : {}) : { ...db }),
    set: async o => { Object.assign(db, structuredClone(o)); },
    remove: async k => { delete db[k]; },
  } },
  tabs: {}, runtime: {},
};
const { planSales, orderRows, lastName, dropSale } = await import('../extension/lib/plan.js');
const { BRACKETS } = await import('../extension/lib/carriers.js');
const { saveRun, getRun } = await import('../extension/lib/store.js');
const { sales } = await import('./fixtures/nl-sales.mjs');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = n => JSON.parse(fs.readFileSync(path.join(root, 'extension', 'data', `${n}.json`), 'utf8'));
const countries = read('countries');
const nl = { methods: read('methods'), countries, byName: Object.fromEntries(Object.entries(countries).map(([iso, v]) => [v[0], iso])) };

test('a last name starts at the first name particle, else after the first word', () => {
  assert.equal(lastName('Jan Jansen'), 'Jansen');
  assert.equal(lastName('David Adriaan Van Ameijde'), 'Van Ameijde');
  assert.equal(lastName('Cees de Vries'), 'de Vries');
  assert.equal(lastName('Anna Maria Schmidt'), 'Maria Schmidt');
  assert.equal(lastName('Quinn'), 'Quinn');
  assert.equal(lastName('  '), '');
  assert.equal(lastName(undefined), '');
});

test('orderRows gives one row per sale with the columns of the orders table', () => {
  const rows = orderRows([
    { id: '1304473030', lines: [{ kind: 'Name', text: 'David Adriaan Van Ameijde' }, { kind: 'Country', text: 'Netherlands' }], articles: 1, value: 10.95, total: 12.65 },
    { id: '5', lines: [], error: 'shipping method not found on page' },
    { id: '6', lines: [{ kind: 'Name', text: 'Anna Schmidt' }, { kind: 'Country', text: 'Germany' }], value: null },
  ]);
  assert.deepEqual(rows[0], { id: '1304473030', lastName: 'Van Ameijde', country: 'Netherlands', qty: 1, value: 10.95, total: 12.65 });
  assert.deepEqual(rows[1], { id: '5', error: 'shipping method not found on page' });
  assert.deepEqual(rows[2], { id: '6', lastName: 'Schmidt', country: 'Germany', qty: null, value: null, total: null });
});

test('planning the sales that remain updates the breakdown, and an error sale can be removed too', () => {
  const before = planSales(sales, nl, 'NL', BRACKETS);
  const drop = before.tracked.find(x => !x.error).Id;
  const after = planSales(sales.filter(s => s.id !== drop), nl, 'NL', BRACKETS);
  assert.equal(after.count, before.count - 1);
  assert.equal(after.tracked.length, before.tracked.length - 1);
  assert.ok(!after.tracked.some(x => x.Id === drop));
  const noError = planSales(sales.filter(s => !s.error), nl, 'NL', BRACKETS);
  assert.equal(noError.skipped.length, before.skipped.length - 1);
  assert.equal(orderRows(sales.filter(s => s.id !== drop)).length, sales.length - 1);
});

test('a saved run keeps its sales and, when planned again, its load time', async () => {
  db = {};
  const loadedAt = new Date(Date.now() - 30 * 60000);
  await saveRun('Paid', { print: [] }, null, sales, loadedAt);
  const r = await getRun();
  assert.equal(r.sales.length, sales.length);
  assert.equal(+r.loadedAt, +loadedAt);
  await saveRun('Paid', { print: [] }, null, sales.slice(1), r.loadedAt);
  const again = await getRun();
  assert.equal(again.sales.length, sales.length - 1);
  assert.equal(+again.loadedAt, +loadedAt);
  db = {};
  await saveRun('Paid', { print: [] });
  assert.equal((await getRun()).sales, null);
});

test('dropSale takes one sale out and keeps the chosen numbers only while some are left', () => {
  const run = { sales: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], only: ['a', 'b'] };
  assert.deepEqual(dropSale(run, 'a'), { sales: [{ id: 'b' }, { id: 'c' }], only: ['b'] });
  assert.deepEqual(dropSale({ sales: [{ id: 'a' }], only: ['a'] }, 'a'), { sales: [], only: null });
  assert.deepEqual(dropSale({ sales: [{ id: 'a' }, { id: 'b' }], only: null }, 'b'), { sales: [{ id: 'a' }], only: null });
  assert.equal(run.sales.length, 3);   // the run is not changed
});

test('a sale page without a readable article count gives an empty quantity, not NaN', () => {
  const [row] = orderRows([{ id: '1', lines: [{ kind: 'Name', text: 'A B' }], articles: NaN, value: NaN, total: undefined }]);
  assert.deepEqual([row.qty, row.value, row.total], [null, null, null]);
});
