import test from 'node:test';
import assert from 'node:assert/strict';
import { splitStreet, splitExtra, planSales } from '../extension/lib/plan.js';
import { postcodeProblem } from '../extension/lib/postcode.js';

const rows = [
  // [iso, street line, Street, Nr, Ext, Extra]
  ['DE', 'Straße des 17. Juni 135', 'Straße des 17. Juni', '135', '', ''],
  ['IT', 'Via 4 Novembre 10', 'Via 4 Novembre', '10', '', ''],
  ['ES', 'Calle 7 de Julio 5', 'Calle 7 de Julio', '5', '', ''],
  ['IT', 'Via Roma 10/B', 'Via Roma', '10', 'B', ''],
  ['PL', 'ul. Długa 12 m. 5', 'ul. Długa', '12', '', 'm. 5'],
  ['DE', 'Hauptstraße 12a', 'Hauptstraße', '12', 'a', ''],
  ['NL', 'Kerkstraat 1', 'Kerkstraat', '1', '', ''],
  ['FR', '12 rue de la Paix', 'rue de la Paix', '12', '', ''],
  ['BE', 'Rue de la Loi 16 bte 4', 'Rue de la Loi', '16', '', 'bte 4'],
  ['SE', 'Storgatan 5 lgh 1201', 'Storgatan', '5', '', 'lgh 1201'],
  ['PL', 'ul. Długa 12 lok. 5', 'ul. Długa', '12', '', 'lok. 5'],
  ['PL', 'ul. Długa 12 lokal 5', 'ul. Długa', '12', '', 'lokal 5'],
  ['DE', 'Hauptstraße 12 Haus 3', 'Hauptstraße', '12', '', 'Haus 3'],
  ['DE', 'Hauptstraße 12 Hof 3', 'Hauptstraße', '12', '', 'Hof 3'],
  ['DE', 'Hauptstraße 12 Zimmer 4', 'Hauptstraße', '12', '', 'Zimmer 4'],
  ['DE', 'Hauptstraße 12 Eingang 3', 'Hauptstraße', '12', '', 'Eingang 3'],
  ['AT', 'Hauptstraße 12 Top 5', 'Hauptstraße', '12', '', 'Top 5'],
  ['AT', 'Hauptstraße 12 Stiege 2 Top 5', 'Hauptstraße', '12', '', 'Stiege 2 Top 5'],
  ['PL', 'ul. Długa 12 bt 5', 'ul. Długa', '12', '', 'bt 5'],
  ['PT', 'Rua Augusta 12 Loja 3', 'Rua Augusta', '12', '', 'Loja 3'],
  ['DE', 'Hauptstr. 5 Halle 3', 'Hauptstr.', '5', '', 'Halle 3'],
  ['DE', 'Musterstraße 5 Aufgang 2', 'Musterstraße', '5', '', 'Aufgang 2'],
  ['SE', 'Storgatan 3 Trappa 2', 'Storgatan', '3', '', 'Trappa 2'],
  ['DK', 'Vestergade 12 st 3', 'Vestergade', '12', '', 'st 3'],
  ['NO', 'Storgata 5 Leil 3', 'Storgata', '5', '', 'Leil 3'],
  ['DE', 'Karlsplatz 4 Aufzug 2', 'Karlsplatz', '4', '', 'Aufzug 2'],
  ['DE', 'Hauptstraße 12 Nr. 3', 'Hauptstraße', '12', '', 'Nr. 3'],
  ['GB', '12 Hill Top Road', 'Hill Top Road', '12', '', ''],
  ['DE', 'Am Neuen Hof 3', 'Am Neuen Hof', '3', '', ''],
  ['DE', 'Neuer Hof 12', 'Neuer Hof', '12', '', ''],
  ['DE', 'Hof 3', 'Hof', '3', '', ''],
  ['DE', 'Top 5', 'Top', '5', '', ''],
];

for (const [iso, line, Street, Nr, Ext, Extra] of rows) {
  test(`splitStreet ${iso} "${line}"`, () => {
    const r = splitStreet(iso, line, []);
    assert.deepEqual({ Street: r.Street, Nr: r.Nr, Ext: r.Ext, Extra: r.Extra }, { Street, Nr, Ext, Extra });
  });
}

test('splitStreet returns the Dutch street line fields', () => {
  assert.deepEqual(splitStreet('NL', 'Kerkstraat 12A', []), { Street: 'Kerkstraat', Nr: '12', Ext: 'A', Extra: '', Fields: {} });
});

test('splitStreet does not split a six digit number', () => {
  const r = splitStreet('DE', 'Hauptstraße 123456', []);
  assert.ok(r === null || (r.Nr !== '12345' && r.Extra !== '6'));
});

const keywordRows = [
  ['IT', 'Via della Scala 5', 'Via della Scala', '5', ''],
  ['DE', 'Am Stock 5', 'Am Stock', '5', ''],
  ['ES', 'Calle de la Escalera 3', 'Calle de la Escalera', '3', ''],
  ['FR', '5 rue de la Résidence', 'rue de la Résidence', '5', ''],
  ['GB', 'Apartment 5, 12 Main Street', 'Main Street', '12', 'Apartment 5'],
  ['GB', 'Unit 3, 12 Main Street', 'Main Street', '12', 'Unit 3'],
  ['GB', 'Flat 2, 10 High Street', 'High Street', '10', 'Flat 2'],
];

for (const [iso, line, Street, Nr, Extra] of keywordRows) {
  test(`splitStreet keeps keywords in street names ${iso} "${line}"`, () => {
    const r = splitStreet(iso, line, []);
    assert.ok(r, 'expected a street and number');
    assert.deepEqual({ Street: r.Street, Nr: r.Nr, Extra: r.Extra }, { Street, Nr, Extra });
  });
}

test('splitStreet puts the flat in the flat field', () => {
  assert.deepEqual(splitStreet('GB', 'Flat 2, 10 High Street', []).Fields, { Flat: 'Flat 2' });
  assert.deepEqual(splitStreet('GB', 'Apartment 5, 12 Main Street', []).Fields, { Flat: 'Apartment 5' });
});

for (const [text, field] of [['3º B', 'Verdieping'], ['3º Esq', 'Verdieping'], ['2. th.', 'Verdieping'], ['3. Stock', 'Verdieping'], ['bte 3', 'Flat']]) {
  test(`splitExtra "${text}" goes to ${field}`, () => {
    assert.deepEqual(splitExtra(text), { [field]: text });
  });
}

const trackedCfg = {
  byName: { Netherlands: 'NL', Belgium: 'BE', Germany: 'DE' },
  countries: { NL: ['x', 'Netherlands', '\\d{4} ?[A-Z]{2}'], BE: ['x', 'Belgium', '\\d{4}'], DE: ['x', 'Germany', '\\d{5}'] },
  methods: { Parcel: { Service: 'postnl', Product: 'Gemiddeld pakket', Option: '' } },
};
const trackedPlan = (country, street, city) => planSales([{
  id: '1', methodName: 'Parcel', method: 'Parcel max. 2000 g', grams: 2000, tracked: true, value: 10,
  lines: [{ kind: 'Name', text: 'Jan Jansen' }, { kind: 'Street', text: street }, { kind: 'City', text: city }, { kind: 'Country', text: country }],
}], trackedCfg).tracked[0];

test('splitNL keeps a number in the street name and takes the last number as house number', () => {
  const p = trackedPlan('Netherlands', 'Plein 1944 12', '1234AB Utrecht');
  assert.deepEqual({ Street: p.Street, Number: p.Number, Suffix: p.Suffix, error: p.error }, { Street: 'Plein 1944', Number: '12', Suffix: '', error: undefined });
});

for (const [line, Street, Number, SuffixKey] of [
  ['Weesperstraat 55 1', 'Weesperstraat', '55', '1'],
  ['Herengracht 100 2', 'Herengracht', '100', '2'],
  ['Kerkstraat 12 3', 'Kerkstraat', '12', '3'],
  ['2e Jan van der Heijdenstraat 12 3', '2e Jan van der Heijdenstraat', '12', '3'],
]) {
  test(`splitNL takes a number then a digit suffix as house number and suffix "${line}"`, () => {
    const p = trackedPlan('Netherlands', line, '1234AB Utrecht');
    assert.deepEqual({ Street: p.Street, Number: p.Number, SuffixKey: p.SuffixKey }, { Street, Number, SuffixKey });
  });
}

test('splitNL keeps a dashed numeric suffix as suffix', () => {
  const p = trackedPlan('Netherlands', 'Kerkstraat 12-3', '1234AB Utrecht');
  assert.deepEqual({ Street: p.Street, Number: p.Number, SuffixKey: p.SuffixKey }, { Street: 'Kerkstraat', Number: '12', SuffixKey: '3' });
});

for (const [country, city, Postcode, Town] of [
  ['Netherlands', '1234 ab Amsterdam', '1234AB', 'Amsterdam'],
  ['Belgium', 'B-1000 Brussel', '1000', 'Brussel'],
  ['Germany', 'D-10623 Berlin', '10623', 'Berlin'],
]) {
  test(`tracked plan accepts postcode line "${city}"`, () => {
    const p = trackedPlan(country, 'Kerkstraat 1', city);
    assert.equal(p.error, undefined);
    assert.deepEqual({ Postcode: p.Postcode, Town: p.Town }, { Postcode, Town });
  });
}

// A domestic sale for a German origin: the German street layout, PLZ + Ort.
for (const [line, Street, Number, Suffix, Extra] of [
  ['Hauptstraße 12a', 'Hauptstraße', '12', 'a', ''],
  ['Straße des 17. Juni 135, Hinterhaus', 'Straße des 17. Juni', '135', '', 'Hinterhaus'],
  ['c/o Müller, Bahnhofstr. 3', 'Bahnhofstr.', '3', '', 'c/o Müller'],
]) {
  test(`DE origin domestic sale splits "${line}"`, () => {
    const p = planSales([{
      id: '1', methodName: 'Parcel', method: 'Parcel max. 2000 g', grams: 2000, tracked: true, value: 10,
      lines: [{ kind: 'Name', text: 'Jan Jansen' }, { kind: 'Street', text: line }, { kind: 'City', text: '10623 Berlin' }, { kind: 'Country', text: 'Germany' }],
    }], trackedCfg, 'DE').tracked[0];
    assert.equal(p.error, undefined);
    assert.deepEqual({ Street: p.Street, Number: p.Number, Suffix: p.Suffix, Extra: p.Extra, Postcode: p.Postcode, Town: p.Town }, { Street, Number, Suffix, Extra, Postcode: '10623', Town: 'Berlin' });
  });
}

test('postcodeProblem checks the postcode against the origin format', () => {
  assert.equal(postcodeProblem('NL', '1234 AB'), '');
  assert.equal(postcodeProblem('DE', '10623'), '');
  assert.equal(postcodeProblem('DE', '1234 AB') !== '', true);
  assert.equal(postcodeProblem('NL', '10623') !== '', true);
  assert.equal(postcodeProblem('DE', ''), '');
});
