import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../extension');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

const SPECIFIER = /(?:\bimport\s*\(\s*|\bimport\s[^'"]*?\bfrom\s*|\bimport\s*|\bexport\s[^'"]*?\bfrom\s*)(['"])(\.{1,2}\/[^'"]+)\1/g;

function moduleGraph(entry) {
  const seen = new Set();
  const walk = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(SPECIFIER)) walk(resolve(dirname(file), match[2]));
  };
  walk(entry);
  return [...seen].map(f => relative(root, f).split(sep).join('/')).sort();
}

test('web_accessible_resources lists exactly the modules panel-app.js reaches, plus the data files', () => {
  const entries = manifest.web_accessible_resources;
  assert.equal(entries.length, 1);
  const expected = [...moduleGraph(resolve(root, 'lib/panel-app.js')), 'data/*.json'].sort();
  assert.deepEqual([...entries[0].resources].sort(), expected);
});

test('the manifest requires Chrome 121 and declares no Android Firefox block', () => {
  assert.equal(manifest.minimum_chrome_version, '121');
  assert.equal(manifest.browser_specific_settings.gecko_android, undefined);
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
});
