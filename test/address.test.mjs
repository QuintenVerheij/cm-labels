import test from 'node:test';
import assert from 'node:assert/strict';
import { splitStreet, splitExtra } from '../extension/lib/plan.js';

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
];

for (const [iso, line, Street, Nr, Ext, Extra] of rows) {
  test(`splitStreet ${iso} "${line}"`, () => {
    const r = splitStreet(iso, line, []);
    assert.deepEqual({ Street: r.Street, Nr: r.Nr, Ext: r.Ext, Extra: r.Extra }, { Street, Nr, Ext, Extra });
  });
}

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
