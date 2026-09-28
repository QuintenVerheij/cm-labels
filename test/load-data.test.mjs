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

test('loadData for origin DE returns the DE files and leaves the NL objects unchanged', async () => {
  const nl = await loadData('NL'), nlMethods = JSON.stringify(nl.methods);
  const d = await loadData('DE');
  assert.ok(fetched.includes('data/methods.DE.json'));
  assert.deepEqual(d.methods, read('methods.DE'));
  assert.deepEqual(d.countries, read('countries.DE'));
  assert.deepEqual(d.rates, read('rates.DE'));
  assert.equal(d.byName.Germany, 'DE');
  assert.notEqual(d, nl);
  assert.equal(await loadData('NL'), nl);
  assert.equal(JSON.stringify(nl.methods), nlMethods);
  assert.deepEqual(nl.methods, read('methods'));
});
