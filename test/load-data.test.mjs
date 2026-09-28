import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'extension', 'data');
const fetched = [];
globalThis.browser = {
  storage: { local: {} }, tabs: {},
  runtime: { getURL: p => p },
};
globalThis.fetch = async url => { fetched.push(url); return { json: async () => JSON.parse(fs.readFileSync(path.join(dataDir, path.basename(url)), 'utf8')) }; };
const { loadData } = await import('../extension/lib/store.js');

const read = n => JSON.parse(fs.readFileSync(path.join(dataDir, `${n}.json`), 'utf8'));

test('loadData for origin NL returns the methods, countries and rates in the NL files', async () => {
  const d = await loadData('NL');
  assert.deepEqual(fetched.sort(), ['data/countries.json', 'data/methods.json', 'data/rates.json']);
  assert.deepEqual(d.methods, read('methods'));
  assert.deepEqual(d.countries, read('countries'));
  assert.deepEqual(d.rates, read('rates'));
  assert.equal(d.byName[read('countries').DE[0]], 'DE');
  assert.equal(await loadData('NL'), d);
});
