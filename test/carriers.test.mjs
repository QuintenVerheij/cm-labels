import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const opened = [];
globalThis.chrome = { tabs: { async create(o) { opened.push(o.url); return { id: 1 }; } }, runtime: {} };
const { buildCart, carrierModule, abortedError, cartTitle, carrierName, methodCarriers, CARRIERS, BRACKETS, ORIGINS } = await import('../extension/lib/carriers.js');
const postnl = await import('../extension/lib/postnl.js');
const { planSales } = await import('../extension/lib/plan.js');
const { sales: nlSales } = await import('./fixtures/nl-sales.mjs');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'extension', 'data');
const read = n => JSON.parse(fs.readFileSync(path.join(dataDir, `${n}.json`), 'utf8'));
const countries = read('countries');
const nl = { methods: read('methods'), countries, byName: Object.fromEntries(Object.entries(countries).map(([iso, v]) => [v[0], iso])) };

const sale = (id, methodName, country, street, city, { grams = 20, tracked = true, value = 5 } = {}) => ({
  id, methodName, method: `${methodName} max. ${grams} g`, grams, tracked, value, email: 'jan@example.com',
  lines: [{ kind: 'Name', text: 'Jan Jansen' }, { kind: 'Street', text: street }, { kind: 'City', text: city }, { kind: 'Country', text: country }],
});

test('NL sales route stamps and tracked labels to PostNL and keeps its fields', () => {
  const p = planSales([
    sale('1', 'Letter', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false }),
    sale('2', 'Brievenbuspakje+', 'Netherlands', 'Kerkstraat 12A', '1234AB Utrecht', { grams: 500 }),
    sale('3', 'SHIPPING COST ESTIMATION for Courier Parcel with Full Insurance', 'Germany', 'Hauptstraße 12', '10623 Berlin', { grams: 2000 }),
    sale('4', 'Standard Letter', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false }),
  ], nl, 'NL', BRACKETS);
  assert.deepEqual(p.stamps, [{ code: 'DE-20', iso: 'DE', weight: 20, country: 'Duitsland', qty: 2, ids: ['1', '4'], weights: [20, 20], carrier: 'postnl' }]);
  assert.equal(p.stampLine, 'DE-20x2');
  assert.equal(p.tracked.length, 1);
  const t = p.tracked[0];
  assert.deepEqual({ Id: t.Id, Iso: t.Iso, Country: t.Country, Product: t.Product, Option: t.Option, Street: t.Street, Number: t.Number, SuffixKey: t.SuffixKey, Postcode: t.Postcode, carrier: t.carrier, error: t.error },
    { Id: '2', Iso: 'NL', Country: 'Nederland', Product: 'Brievenbuspakje', Option: 'Met track & trace', Street: 'Kerkstraat', Number: '12', SuffixKey: 'A', Postcode: '1234AB', carrier: 'postnl', error: undefined });
  assert.deepEqual(p.skipped.map(x => [x.id, x.reason]), [['3', "manual method 'SHIPPING COST ESTIMATION for Courier Parcel with Full Insurance': buy by hand"]]);
  assert.equal(p.print.length, 2);
});

// test/fixtures/nl-plan-before.json is the planner's output for these sales before carriers existed (the planner
// and the NL data of that version): with the fields added since taken off, today's output is the same.
test('NL plans unchanged: the fixture plans exactly as before carriers, apart from the new fields', () => {
  const before = JSON.parse(fs.readFileSync(path.join(root, 'test', 'fixtures', 'nl-plan-before.json'), 'utf8'));
  const p = planSales(nlSales, nl, 'NL', BRACKETS);
  assert.ok(p.stamps.every(g => g.carrier === 'postnl' && g.weights.length === g.qty));
  assert.ok(p.tracked.every(t => t.carrier === 'postnl'));
  const bare = ({ carrier, weights, ...rest }) => rest;
  const now = JSON.parse(JSON.stringify({ ...p, stamps: p.stamps.map(bare), tracked: p.tracked.map(bare) }));
  assert.deepEqual(now, before);
  // the fixture covers both brackets, a heavy letter and every tracked branch
  assert.equal(before.stampLine, 'NL-20x3 DE-20x1 DE-50x3 FR-20x1');
  assert.ok(before.tracked.some(t => t.error) && before.tracked.some(t => !t.error && t.Iso !== 'NL'));
});

test('stamp brackets come from the carrier; each group keeps the grams of its sales', () => {
  assert.deepEqual(postnl.BRACKETS, [20, 50]);
  assert.deepEqual(BRACKETS, { postnl: [20, 50] });
  const cfg = { ...nl, methods: { ...nl.methods, Brief: { Service: 'stamp', Carrier: 'deutschepost' }, Letter: { Service: 'stamp', Carrier: 'postnl' } } };
  const brackets = { postnl: [20, 50], deutschepost: [20, 50, 500, 1000] };
  const p = planSales([
    sale('1', 'Letter', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false, grams: 50 }),
    sale('2', 'Letter', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false, grams: 60 }),
    sale('3', 'Brief', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false, grams: 60 }),
    sale('4', 'Brief', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false, grams: 400 }),
    sale('5', 'Brief', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false, grams: 1200 }),
  ], cfg, 'NL', brackets);
  assert.deepEqual(p.stamps.map(g => [g.carrier, g.code, g.weight, g.ids, g.weights]), [
    ['postnl', 'DE-50', 50, ['1'], [50]],
    ['deutschepost', 'DE-500', 500, ['3', '4'], [60, 400]],
  ]);
  assert.deepEqual(p.skipped.map(x => [x.id, x.reason]), [
    ['2', "label printed, stamp by hand: no stamp weight up to 50 g in 'Letter max. 60 g'; buy its stamp by hand"],
    ['5', "label printed, stamp by hand: no stamp weight up to 1000 g in 'Brief max. 1200 g'; buy its stamp by hand"],
  ]);
  // a carrier without brackets (no module yet) leaves its stamps for buying by hand, the label still printed
  const q = planSales([sale('6', 'Brief', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false })], cfg, 'NL', BRACKETS);
  assert.deepEqual([q.stamps, q.print.length], [[], 1]);
  assert.match(q.skipped[0].reason, /carrier 'deutschepost' has no stamp weights in cm-labels yet/);
});

test('Service tracked is a tracked method for any carrier; postnl is the same', () => {
  const method = Service => ({ Service, Carrier: 'dhl', Product: 'Paket', Option: 'Standard' });
  const plan = Service => planSales([sale('1', 'Parcel', 'Germany', 'Hauptstraße 12', '10623 Berlin', { grams: 2000 })], { ...nl, methods: { Parcel: method(Service) } });
  const t = plan('tracked');
  assert.deepEqual([t.skipped, t.tracked.length], [[], 1]);
  assert.deepEqual({ Id: t.tracked[0].Id, Product: t.tracked[0].Product, carrier: t.tracked[0].carrier, error: t.tracked[0].error }, { Id: '1', Product: 'Paket', carrier: 'dhl', error: undefined });
  assert.deepEqual(plan('postnl'), t);
});

test('a method with carrier none never reaches a cart', () => {
  const cfg = { ...nl, methods: { Letter: { Service: 'stamp', Carrier: 'none' }, Parcel: { Service: 'postnl', Carrier: 'none', Product: 'Gemiddeld pakket', Option: 'Met track & trace' } } };
  const p = planSales([
    sale('1', 'Letter', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false }),
    sale('2', 'Parcel', 'Germany', 'Hauptstraße 12', '10623 Berlin', { grams: 2000 }),
    sale('3', 'Mystery Letter', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false }),
  ], cfg, 'NL', BRACKETS);
  assert.deepEqual([p.stamps, p.tracked], [[], []]);
  assert.deepEqual(p.skipped.map(x => x.id), ['1', '2', '3']);
  assert.match(p.skipped[1].reason, /no carrier/);
  assert.equal(p.print.length, 2);   // an untracked sale still gets its address label
});

test('buildCart refuses carrier none and an unknown carrier before any tab opens', async () => {
  opened.length = 0;
  const g = { code: 'DE-20', iso: 'DE', weight: 20, country: 'Duitsland', qty: 1, ids: ['1'] };
  await assert.rejects(buildCart({ stamps: [{ ...g, carrier: 'none' }], tracked: [] }), /DE-20: carrier none has no cart/);
  await assert.rejects(buildCart({ stamps: [], tracked: [{ Id: '7', carrier: 'fedex' }] }), /7: unknown carrier 'fedex'/);
  await assert.rejects(buildCart({ stamps: [], tracked: [{ Id: '8' }] }), /unknown carrier 'undefined'.*load the sales again/);
  await assert.rejects(buildCart({ stamps: [{ ...g, carrier: 'dhl' }], tracked: [] }), /carrier 'dhl' has no cart/);
  // a mix with a carrier that has no module: refused as a whole, PostNL's items are not started either
  await assert.rejects(buildCart({ stamps: [{ ...g, carrier: 'postnl' }], tracked: [{ Id: '9', carrier: 'dhl' }] }), /^Error: 9: carrier 'dhl' has no cart/);
  assert.deepEqual(opened, []);
});

test('the refusal names the first few items and counts the rest', async () => {
  const tracked = Array.from({ length: 7 }, (_, i) => ({ Id: String(100 + i), carrier: 'fedex' }));
  await assert.rejects(buildCart({ stamps: [], tracked }), e => e.message.startsWith("100, 101, 102 and 4 more: unknown carrier 'fedex'"));
  await assert.rejects(buildCart({ stamps: [], tracked: tracked.slice(0, 3) }), e => e.message.startsWith("100, 101, 102: unknown carrier 'fedex'"));
});

const fake = (CONC, calls, { fail } = {}) => ({
  NAME: CONC === 1 ? 'DHL' : 'PostNL', STEPS: { stamp: 2, tracked: 3, merge: 1 }, CONC,
  buildCart: async o => { calls.push(o); if (fail) throw new Error(fail); return { items: [], merged: false }; },
});

test('buildCart hands the items to their carrier and holds it to its CONC', async () => {
  const calls = [];
  const modules = { postnl: fake(undefined, calls), dhl: fake(1, calls) };
  const tracked = [{ Id: '1', carrier: 'postnl' }], log = () => {};
  assert.deepEqual(await buildCart({ stamps: [], tracked, log, windowId: 3 }, modules), { carts: [{ carrier: 'postnl', items: [], merged: false }] });
  assert.deepEqual(calls.pop(), { stamps: [], tracked, log, windowId: 3, conc: undefined });
  await buildCart({ stamps: [], tracked, conc: 4 }, modules);
  assert.equal(calls.pop().conc, 4);
  for (const conc of [undefined, 6]) {
    await buildCart({ stamps: [], tracked: [{ Id: '2', carrier: 'dhl' }], conc }, modules);
    assert.equal(calls.pop().conc, 1);
  }
  assert.deepEqual(await buildCart({ stamps: [], tracked: [] }, modules), { carts: [] });
});

test('a mix of carriers makes one cart per carrier, one carrier after the other, with one progress bar', async () => {
  const order = [], progress = [];
  let running = 0;
  const mod = (name, CONC) => ({
    NAME: name, STEPS: { stamp: 2, tracked: 3, merge: 1 }, CONC,
    async buildCart({ stamps, tracked, conc, onProgress }) {
      assert.equal(running++, 0, 'one carrier at a time');
      order.push([name, stamps.map(g => g.code), tracked.map(p => p.Id), conc]);
      const n = stamps.length + tracked.length, total = stamps.length * 2 + tracked.length * 3 + 1;
      onProgress(0, total, { items: 0, of: n });
      await new Promise(r => setTimeout(r, 5));
      onProgress(total, total, { items: n, of: n });
      running--;
      return { items: [...stamps.map(g => ({ kind: 'stamp', key: g.code, ok: true })), ...tracked.map(p => ({ kind: 'tracked', key: p.Id, ok: true }))], merged: true, count: n, total: n };
    },
  });
  const modules = { postnl: mod('PostNL'), dhl: mod('DHL', 1) };
  const r = await buildCart({
    stamps: [{ code: 'DE-20', carrier: 'postnl' }],
    tracked: [{ Id: '1', carrier: 'dhl' }, { Id: '2', carrier: 'postnl' }, { Id: '3', carrier: 'dhl' }],
    conc: 4, onProgress: (...a) => progress.push(a),
  }, modules);
  assert.deepEqual(order, [['PostNL', ['DE-20'], ['2'], 4], ['DHL', [], ['1', '3'], 1]]);
  assert.deepEqual(r.carts.map(c => [c.carrier, c.merged, c.items.map(i => i.key)]), [['postnl', true, ['DE-20', '2']], ['dhl', true, ['1', '3']]]);
  // postnl: 2 + 3 + 1 = 6 steps, dhl: 3 + 3 + 1 = 7; items 2 + 2
  assert.deepEqual(progress, [[0, 13, { items: 0, of: 4 }], [6, 13, { items: 2, of: 4 }], [6, 13, { items: 2, of: 4 }], [13, 13, { items: 4, of: 4 }]]);
  assert.equal(abortedError(r, modules), null);
});

test('a carrier whose module throws does not stop the next one', async () => {
  const calls = [];
  const modules = { postnl: fake(undefined, calls, { fail: 'tab closed' }), dhl: fake(1, calls) };
  const r = await buildCart({ stamps: [], tracked: [{ Id: '1', carrier: 'postnl' }, { Id: '2', carrier: 'dhl' }] }, modules);
  assert.equal(calls.length, 2);
  assert.deepEqual(r.carts, [{ carrier: 'postnl', items: [], merged: false, error: 'tab closed', aborted: true }, { carrier: 'dhl', items: [], merged: false }]);
  assert.equal(abortedError(r, modules), 'PostNL: tab closed');
  // one carrier: the module's own message, as before carriers
  assert.equal(abortedError(await buildCart({ stamps: [], tracked: [{ Id: '1', carrier: 'postnl' }] }, modules), modules), 'tab closed');
});

test('carrier names, cart titles and host origins come from the modules', () => {
  assert.equal(postnl.NAME, 'PostNL');
  assert.equal(carrierName('postnl'), 'PostNL');
  assert.equal(carrierName('dhl'), 'dhl');
  assert.equal(cartTitle(['postnl']), 'PostNL cart');
  assert.equal(cartTitle([]), 'cart');
  assert.equal(cartTitle(['postnl', 'dhl'], { postnl: { NAME: 'PostNL' }, dhl: { NAME: 'DHL' } }), 'PostNL and DHL carts');
  assert.deepEqual(methodCarriers(nl.methods), ['postnl']);
  assert.deepEqual(ORIGINS, ['https://jouw.postnl.nl/*']);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
  for (const o of ORIGINS) assert.ok(manifest.host_permissions.includes(o), o);
});

test('the known carriers are the ones the methods files may name', () => {
  assert.deepEqual(CARRIERS, ['postnl', 'deutschepost', 'dhl', 'none']);
});

test('carrierModule gives the PostNL module for postnl', async () => {
  assert.equal(carrierModule('postnl', 'x'), postnl);
});
