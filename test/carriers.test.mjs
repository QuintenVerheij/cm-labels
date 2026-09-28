import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const opened = [];
globalThis.chrome = { tabs: { async create(o) { opened.push(o.url); return { id: 1 }; } }, runtime: {} };
const { buildCart, carrierModule, CARRIERS } = await import('../extension/lib/carriers.js');
const { planSales } = await import('../extension/lib/plan.js');

const dataDir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'extension', 'data');
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
  ], nl);
  assert.deepEqual(p.stamps, [{ code: 'DE-20', iso: 'DE', weight: 20, country: 'Duitsland', qty: 2, ids: ['1', '4'], carrier: 'postnl' }]);
  assert.equal(p.stampLine, 'DE-20x2');
  assert.equal(p.tracked.length, 1);
  const t = p.tracked[0];
  assert.deepEqual({ Id: t.Id, Iso: t.Iso, Country: t.Country, Product: t.Product, Option: t.Option, Street: t.Street, Number: t.Number, SuffixKey: t.SuffixKey, Postcode: t.Postcode, carrier: t.carrier, error: t.error },
    { Id: '2', Iso: 'NL', Country: 'Nederland', Product: 'Brievenbuspakje', Option: 'Met track & trace', Street: 'Kerkstraat', Number: '12', SuffixKey: 'A', Postcode: '1234AB', carrier: 'postnl', error: undefined });
  assert.deepEqual(p.skipped.map(x => [x.id, x.reason]), [['3', "manual method 'SHIPPING COST ESTIMATION for Courier Parcel with Full Insurance': buy by hand"]]);
  assert.equal(p.print.length, 2);
});

test('a method with carrier none never reaches a cart', () => {
  const cfg = { ...nl, methods: { Letter: { Service: 'stamp', Carrier: 'none' }, Parcel: { Service: 'postnl', Carrier: 'none', Product: 'Gemiddeld pakket', Option: 'Met track & trace' } } };
  const p = planSales([
    sale('1', 'Letter', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false }),
    sale('2', 'Parcel', 'Germany', 'Hauptstraße 12', '10623 Berlin', { grams: 2000 }),
    sale('3', 'Mystery Letter', 'Germany', 'Hauptstraße 12', '10623 Berlin', { tracked: false }),
  ], cfg);
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
  await assert.rejects(buildCart({ stamps: [{ ...g, carrier: 'postnl' }], tracked: [{ Id: '9', carrier: 'dhl' }] }), /one cart per carrier: .*postnl \(DE-20\) and dhl \(9\)/);
  assert.deepEqual(opened, []);
});

test('buildCart hands the items to their carrier and holds it to its CONC', async () => {
  const calls = [];
  const fake = CONC => ({ STEPS: { stamp: 1, tracked: 1, merge: 1 }, CONC, buildCart: async o => { calls.push(o); return { items: [], merged: false }; } });
  const modules = { postnl: fake(undefined), dhl: fake(1) };
  const tracked = [{ Id: '1', carrier: 'postnl' }], log = () => {};
  assert.deepEqual(await buildCart({ stamps: [], tracked, log, windowId: 3 }, modules), { items: [], merged: false });
  assert.deepEqual(calls.pop(), { stamps: [], tracked, log, windowId: 3, conc: undefined });
  await buildCart({ stamps: [], tracked, conc: 4 }, modules);
  assert.equal(calls.pop().conc, 4);
  for (const conc of [undefined, 6]) {
    await buildCart({ stamps: [], tracked: [{ Id: '2', carrier: 'dhl' }], conc }, modules);
    assert.equal(calls.pop().conc, 1);
  }
});

test('the known carriers are the ones the methods files may name', () => {
  assert.deepEqual(CARRIERS, ['postnl', 'deutschepost', 'dhl', 'none']);
});

test('carrierModule gives the PostNL module for postnl', async () => {
  assert.equal(carrierModule('postnl', 'x'), await import('../extension/lib/postnl.js'));
});
