// Converts the data sources (methods.psd1, countries.psd1, shipping-costs.csv) into the JSON files the
// browser extension ships with. Run after editing them: node tools/build-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../cdp/config.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'extension', 'data');
const { methods, countries } = loadConfig(root);
const csv = fs.readFileSync(path.join(root, 'shipping-costs.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(line => {
  const cells = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { cells.push(cur); cur = ''; } else cur += c; }
  cells.push(cur); return cells;
});
const [head, ...rows] = csv;
const rates = rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
fs.mkdirSync(out, { recursive: true });
for (const [name, data] of Object.entries({ methods, countries, rates })) fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(data, null, 1) + '\n', 'utf8');
console.log(`wrote ${Object.keys(methods).length} methods, ${Object.keys(countries).length} countries, ${rates.length} rates to ${out}`);
