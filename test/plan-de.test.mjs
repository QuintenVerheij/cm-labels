import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.chrome = { tabs: {}, runtime: {} };
const { BRACKETS, methodCarriers } = await import('../extension/lib/carriers.js');
const { planSales } = await import('../extension/lib/plan.js');

const dataDir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'extension', 'data');
const read = n => JSON.parse(fs.readFileSync(path.join(dataDir, `${n}.json`), 'utf8'));
const countries = read('countries.DE');
const de = { methods: read('methods.DE'), countries, byName: Object.fromEntries(Object.entries(countries).map(([iso, v]) => [v[0], iso])) };

const sale = (id, methodName, country, street, city, { grams = 20, tracked = false, value = 5 } = {}) => ({
  id, methodName, method: `${methodName} max. ${grams} g`, grams, tracked, value, email: 'jan@example.com',
  lines: [{ kind: 'Name', text: 'Jan Jansen' }, { kind: 'Street', text: street }, { kind: 'City', text: city }, { kind: 'Country', text: country }],
});

test('every method a German seller is offered has a service and a carrier, and a manual one a reason', () => {
  const rates = read('rates.DE');
  assert.deepEqual([...new Set(rates.map(r => r.Method))].filter(n => !de.methods[n]), []);
  for (const [name, m] of Object.entries(de.methods)) {
    assert.ok(['stamp', 'manual'].includes(m.Service), name);
    assert.ok(['deutschepost', 'dhl', 'none'].includes(m.Carrier), name);
    if (m.Service === 'manual') assert.ok(m.Reason, name);
  }
  assert.ok(de.methods['Grossbrief'] && de.methods['Kompaktbrief + Einschreiben EINWURF']);
});

test('DE sales give a stamp or a manual label and never a PostNL cart item', () => {
  const p = planSales([
    sale('1', 'Standardbrief', 'Germany', 'Hauptstraße 12', '10623 Berlin'),
    sale('2', 'Grossbrief', 'Germany', 'Hauptstraße 12', '10623 Berlin', { grams: 400 }),
    sale('3', 'Letter (Standardbrief)', 'France', '12 rue de la Paix', '75002 Paris'),
    sale('4', 'Kompaktbrief + Einschreiben EINWURF', 'Germany', 'Hauptstraße 12', '10623 Berlin', { grams: 50, tracked: true, value: 60 }),
    sale('5', 'DHL Paket', 'Germany', 'Hauptstraße 12', '10623 Berlin', { grams: 5000, tracked: true, value: 200 }),
    sale('6', 'Virtual Delivery', 'Austria', 'Ringstraße 1', '1010 Wien', { grams: 0, tracked: true, value: 50 }),
  ], de, 'DE', BRACKETS);
  assert.deepEqual(p.tracked, []);
  assert.deepEqual(p.stamps, []);
  assert.deepEqual(p.print.map(x => x.Id), ['1', '2', '3']);
  assert.deepEqual(p.skipped.map(x => [x.id, x.reason]), [
    ['1', "label printed, stamp by hand: carrier 'deutschepost' has no stamp weights in cm-labels yet; buy its stamp by hand"],
    ['2', "label printed, stamp by hand: carrier 'deutschepost' has no stamp weights in cm-labels yet; buy its stamp by hand"],
    ['3', "label printed, stamp by hand: carrier 'deutschepost' has no stamp weights in cm-labels yet; buy its stamp by hand"],
    ['4', "manual method 'Kompaktbrief + Einschreiben EINWURF': Einschreiben Einwurf is not in a cart yet"],
    ['5', "manual method 'DHL Paket': DHL labels are not in a cart yet"],
    ['6', "manual method 'Virtual Delivery': nothing to ship: deliver it digitally"],
  ]);
});

test('with a Deutsche Post stamp module the letters are grouped by weight bracket', () => {
  const p = planSales([
    sale('1', 'Standardbrief', 'Germany', 'Hauptstraße 12', '10623 Berlin'),
    sale('2', 'Grossbrief', 'Germany', 'Hauptstraße 12', '10623 Berlin', { grams: 400 }),
  ], de, 'DE', { deutschepost: [20, 50, 500, 1000] });
  assert.deepEqual(p.stamps.map(g => [g.carrier, g.code, g.weight, g.ids]), [['deutschepost', 'DE-20', 20, ['1']], ['deutschepost', 'DE-500', 500, ['2']]]);
});

test('the origin\'s cart is named by its stamp carrier, not by manual methods', () => {
  assert.deepEqual(methodCarriers(de.methods), ['deutschepost']);
});
