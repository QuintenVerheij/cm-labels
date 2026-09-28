// Firefox signing for self-distribution ("unlisted": signed by Mozilla, not listed on addons.mozilla.org).
// The API key stays out of the source and off the command line: web-ext reads it from the environment.
//   PowerShell:  $env:WEB_EXT_API_KEY = 'user:12345:67'; $env:WEB_EXT_API_SECRET = '...'; node tools/sign.mjs
//   Git Bash:    WEB_EXT_API_KEY='user:12345:67' WEB_EXT_API_SECRET='...' node tools/sign.mjs
// Get the key at https://addons.mozilla.org/developers/addon/api/key/ (Developer Hub > Manage API Keys).
// Each upload needs a new "version" in extension/manifest.json. The signed .xpi lands in dist/.
// Pass --help to print usage without contacting anyone.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_EXT = 'web-ext@10.7.0';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: WEB_EXT_API_KEY=... WEB_EXT_API_SECRET=... node tools/sign.mjs\nSigns extension/ as an unlisted Firefox add-on with ${WEB_EXT}; the .xpi lands in dist/.`);
  process.exit(0);
}
if (!process.env.WEB_EXT_API_KEY || !process.env.WEB_EXT_API_SECRET) {
  console.error('Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET first (see the top of this file).');
  process.exit(1);
}

// Node refuses to spawn a .cmd file without a shell (EINVAL), so on Windows run npm's own npx script through node.
let cmd = 'npx', pre = [];
if (process.platform === 'win32') {
  const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (!fs.existsSync(cli)) { console.error(`npx not found: expected ${cli} next to node.exe. Install Node.js with npm.`); process.exit(1); }
  cmd = process.execPath; pre = [cli];
}
const r = spawnSync(cmd, [...pre, '--yes', WEB_EXT, 'sign', '--source-dir', path.join(root, 'extension'), '--artifacts-dir', path.join(root, 'dist'), '--channel', 'unlisted'],
  { stdio: 'inherit', shell: false, env: process.env });
if (r.error) { console.error(`Could not run npx: ${r.error.message}`); process.exit(1); }
process.exit(r.status ?? 1);
