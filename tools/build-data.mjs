// Converts the data sources (methods.psd1, countries.psd1, shipping-costs.csv) into the JSON files the
// browser extension ships with. Run after editing them: node tools/build-data.mjs
// One set of sources and JSON files per origin country. NL uses the bare names (methods.psd1, countries.psd1,
// shipping-costs.csv -> methods.json, countries.json, rates.json); another origin puts its ISO code before the
// extension (methods.DE.psd1, countries.DE.psd1, shipping-costs.DE.csv -> methods.DE.json, ...). Every
// methods.<ISO>.psd1 in the repository root adds an origin.
//   --out <dir>   write the JSON files to <dir> instead of extension/data
//   --csv <file>  read the NL rates from <file> instead of shipping-costs.csv
//   --check       write nothing; exit 1 if extension/data differs from the sources or a rate row is duplicated
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../cdp/config.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'extension', 'data');

const args = process.argv.slice(2);
const check = args.includes('--check');
const option = name => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  if (!args[i + 1] || args[i + 1].startsWith('--')) { console.error(`${name} needs a value`); process.exit(2); }
  return path.resolve(args[i + 1]);
};
const out = option('--out') ?? dataDir;
const csvOverride = option('--csv');
const origins = ['NL', ...fs.readdirSync(root).map(f => /^methods\.([A-Z]{2})\.psd1$/.exec(f)?.[1]).filter(Boolean).sort()];

// PowerShell's hashtable order differs between Windows PowerShell and pwsh (and between pwsh runs): sort the keys
// so every platform writes the same JSON. Arrays keep their order.
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}

function rateKey(r) { return [r.Iso, r.Method, r.MaxWeight, r.MaxValue].join(' | '); }

function findDuplicates(rates) {
  const groups = new Map();
  for (const r of rates) { const k = rateKey(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  return [...groups].filter(([k, rows]) => rows.length > 1);
}

function build(origin) {
  const sfx = origin === 'NL' ? '' : '.' + origin;
  const { methods, countries } = sortKeys(loadConfig(root, origin));
  const csvPath = (origin === 'NL' && csvOverride) || path.join(root, `shipping-costs${sfx}.csv`);
  const csv = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(line => {
    const cells = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { cells.push(cur); cur = ''; } else cur += c; }
    cells.push(cur); return cells;
  });
  const [head, ...rows] = csv;
  const rates = rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));

  const duplicates = findDuplicates(rates);
  if (duplicates.length) {
    console.error('duplicate rate rows (same Iso, Method, MaxWeight, MaxValue):');
    for (const [k, dupRows] of duplicates) for (const r of dupRows) console.error(`  ${k} -> ${JSON.stringify(r)}`);
    process.exit(1);
  }

  const files = Object.entries({ methods, countries, rates }).map(([name, data]) => [`${name}${sfx}.json`, JSON.stringify(data, null, 1) + '\n']);
  return { files, methods: Object.keys(methods).length, countries: Object.keys(countries).length, rates: rates.length };
}

const built = origins.map(build);
const files = built.flatMap(b => b.files);
const sum = key => built.reduce((n, b) => n + b[key], 0);

if (check) {
  // Git may check the JSON out with CRLF line endings; compare content, not line endings.
  const norm = s => s.replace(/\r\n/g, '\n');
  const stale = files.filter(([file, text]) => {
    const p = path.join(dataDir, file);
    return !fs.existsSync(p) || norm(fs.readFileSync(p, 'utf8')) !== norm(text);
  }).map(([file]) => file);
  if (stale.length) {
    console.error(`extension/data is out of date with the sources: ${stale.join(', ')}. Run: node tools/build-data.mjs`);
    process.exit(1);
  }
  console.log(`extension/data matches the sources (${sum('rates')} rates)`);
} else {
  fs.mkdirSync(out, { recursive: true });
  for (const [file, text] of files) fs.writeFileSync(path.join(out, file), text, 'utf8');
  console.log(`wrote ${sum('methods')} methods, ${sum('countries')} countries, ${sum('rates')} rates to ${out}`);
}
