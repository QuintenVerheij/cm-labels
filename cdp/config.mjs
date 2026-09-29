// methods.psd1 and countries.psd1 are the source files of the method and country data: read them through
// PowerShell (Import-PowerShellDataFile) and convert to JSON. A PowerShell hashtable has no fixed key order, so
// build-data.mjs sorts the keys before it writes.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// The origin's files: methods.psd1 and countries.psd1 for NL, methods.<ISO>.psd1 and countries.<ISO>.psd1 for another origin.
export function loadConfig(root, origin = 'NL') {
  const sfx = origin === 'NL' ? '' : '.' + origin;
  const ps = `$m = Import-PowerShellDataFile '${path.join(root, `methods${sfx}.psd1`)}'; $c = Import-PowerShellDataFile '${path.join(root, `countries${sfx}.psd1`)}';` +
    `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ConvertTo-Json -Depth 5 -Compress @{ methods = $m; countries = $c }`;
  // Windows PowerShell on Windows, PowerShell 7 (pwsh) elsewhere.
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  let out;
  try { out = execFileSync(shell, ['-NoProfile', '-Command', ps], { encoding: 'utf8' }); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    console.error(`${shell} not found. This tool reads the .psd1 files through PowerShell; on macOS: brew install powershell`);
    process.exit(1);
  }
  const { methods, countries } = JSON.parse(out);
  // countries: ISO -> [Cardmarket English name, PostNL Dutch name, postcode regex?]
  const byName = Object.fromEntries(Object.entries(countries).map(([iso, v]) => [v[0], iso]));
  return { methods, countries, byName };
}
