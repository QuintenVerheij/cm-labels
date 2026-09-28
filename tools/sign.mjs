// Firefox signing for self-distribution ("unlisted": signed by Mozilla, not listed on addons.mozilla.org).
// The API key stays out of the source: set it in the environment for this shell only.
//   PowerShell:  $env:AMO_JWT_ISSUER = 'user:12345:67'; $env:AMO_JWT_SECRET = '...'; node tools/sign.mjs
//   Git Bash:    AMO_JWT_ISSUER='user:12345:67' AMO_JWT_SECRET='...' node tools/sign.mjs
// Get the key at https://addons.mozilla.org/developers/addon/api/key/ (Developer Hub > Manage API Keys).
// Each upload needs a new "version" in extension/manifest.json. The signed .xpi lands in dist/.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { AMO_JWT_ISSUER: key, AMO_JWT_SECRET: secret } = process.env;
if (!key || !secret) { console.error('Set AMO_JWT_ISSUER and AMO_JWT_SECRET first (see the top of this file).'); process.exit(1); }
const r = spawnSync('npx', ['--yes', 'web-ext@latest', 'sign', '--source-dir', path.join(root, 'extension'), '--artifacts-dir', path.join(root, 'dist'),
  '--channel', 'unlisted', '--api-key', key, '--api-secret', secret], { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
