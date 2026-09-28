// Packs extension/ for install from file: dist/cm-labels-<version>.zip (Chromium: Chrome, Brave, Edge) and
// dist/cm-labels-<version>.xpi (Firefox). Same files, manifest.json at the root, forward-slash paths
// (Windows tar.exe; PowerShell 5.1's Compress-Archive writes backslashes, which Firefox refuses).
// Run: node tools/pack.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'extension');
const { version } = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const entries = fs.readdirSync(src).filter(f => !f.startsWith('.'));
// Windows' own bsdtar (not Git's GNU tar, which has no zip format); -a picks zip from the .zip extension.
const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
if (!fs.existsSync(tar)) { console.error(`tar.exe not found at ${tar}. This tool needs Windows' built-in bsdtar (Windows 10 1803 or later).`); process.exit(1); }
const zip = path.join(dist, `cm-labels-${version}.zip`), xpi = path.join(dist, `cm-labels-${version}.xpi`);
for (const f of [zip, xpi]) if (fs.existsSync(f)) fs.unlinkSync(f);
execFileSync(tar, ['-a', '-cf', zip, '-C', src, ...entries]);
fs.copyFileSync(zip, xpi);
for (const f of [zip, xpi]) console.log(`${f}  (${(fs.statSync(f).size / 1024).toFixed(0)} KB)`);
