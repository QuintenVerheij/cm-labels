import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = path.join(root, 'tools', 'build-data.mjs');
const dataDir = path.join(root, 'extension', 'data');
const csvLines = () => fs.readFileSync(path.join(root, 'shipping-costs.csv'), 'utf8').split(/\r?\n/).filter(Boolean);
const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
const snapshot = () => Object.fromEntries(fs.readdirSync(dataDir).map(f => [f, fs.readFileSync(path.join(dataDir, f), 'utf8')]));
const withTmp = fn => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-labels-data-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

test('--check passes on the current tree', () => {
  const r = run('--check');
  assert.equal(r.status, 0, r.stderr);
});

test('--out writes to the given directory and leaves extension/data untouched', () => withTmp(dir => {
  const before = snapshot();
  const r = run('--out', dir);
  assert.equal(r.status, 0, r.stderr);
  const origins = ['', ...fs.readdirSync(root).map(f => /^methods\.([A-Z]{2})\.psd1$/.exec(f)?.[1]).filter(Boolean).map(o => '.' + o)].sort();
  assert.deepEqual(fs.readdirSync(dir).sort(), origins.flatMap(o => ['countries', 'methods', 'rates'].map(n => `${n}${o}.json`)).sort());
  assert.deepEqual(snapshot(), before);
}));

test('--check fails when the sources no longer match extension/data', () => withTmp(dir => {
  const lines = csvLines();
  const csv = path.join(dir, 'rates.csv');
  fs.writeFileSync(csv, [...lines, lines[1].replace(/^[A-Z]{2}/, 'ZZ')].join('\r\n') + '\r\n');
  const r = run('--check', '--csv', csv);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /out of date/);
}));

test('the duplicate check fails on a synthetic duplicate and prints the rows', () => withTmp(dir => {
  const lines = csvLines();
  const csv = path.join(dir, 'rates.csv');
  fs.writeFileSync(csv, [...lines, lines[1]].join('\r\n') + '\r\n');
  const r = run('--out', path.join(dir, 'out'), '--csv', csv);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /duplicate rate rows/);
  assert.equal(r.stderr.split('\n').filter(l => l.startsWith('  AT | Letter | ')).length, 2, r.stderr);
  assert.equal(fs.existsSync(path.join(dir, 'out')), false);
}));

test('every method of every origin names a carrier; a manual method of a non-NL origin has a reason', () => {
  const files = fs.readdirSync(dataDir).filter(f => /^methods(\.[A-Z]{2})?\.json$/.test(f));
  assert.ok(files.includes('methods.json'));
  for (const f of files) {
    for (const [name, m] of Object.entries(JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')))) {
      assert.ok(['postnl', 'deutschepost', 'dhl', 'none'].includes(m.Carrier), `${f}: ${name}`);
      if (m.Service === 'manual' && f !== 'methods.json') assert.ok(m.Reason, `${f}: ${name}`);
      if (m.Service === 'manual' && f === 'methods.json') assert.equal(m.Carrier, 'none', `${f}: ${name}`);
    }
  }
  const nl = JSON.parse(fs.readFileSync(path.join(dataDir, 'methods.json'), 'utf8'));
  assert.deepEqual(Object.values(nl).filter(m => m.Carrier === 'none').map(m => m.Service), ['manual']);
});

test('AT, DK and LI each list the tracked letter at 500 g and 1000 g', () => {
  const tracked = 'Brievenbuspakje met track & trace (Tracked Letterbox packet)';
  const rates = JSON.parse(fs.readFileSync(path.join(dataDir, 'rates.json'), 'utf8'));
  for (const iso of ['AT', 'DK', 'LI']) {
    const weights = rates.filter(r => r.Iso === iso && r.Method === tracked).map(r => r.MaxWeight);
    assert.deepEqual(weights, ['500', '1000'], iso);
  }
});
