import test from 'node:test';
import assert from 'node:assert/strict';
import { splitStreet } from '../extension/lib/plan.js';

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
