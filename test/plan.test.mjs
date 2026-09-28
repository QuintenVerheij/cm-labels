import test from 'node:test';
import assert from 'node:assert/strict';
import { splitStreet } from '../extension/lib/plan.js';

test('splitStreet splits a Dutch street line into street, number and suffix', () => {
  assert.deepEqual(splitStreet('NL', 'Kerkstraat 12A', []), {
    Street: 'Kerkstraat',
    Nr: '12',
    Ext: 'A',
    Extra: '',
    Fields: {},
  });
});
