// Renders extension/icons/icon.svg to PNG (Chromium needs PNG icons; Firefox could use the SVG).
// Uses a throw-away headless Chrome through CDP, transparent background.   Run: node tools/icons.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'extension', 'icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
const exe = `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`;
if (!fs.existsSync(exe)) { console.error(`Chrome not found at ${exe}. Install Google Chrome, or run this on Windows with the default install path.`); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cml-icons-'));
const port = 9241;
const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanup = async () => {
  chrome.kill();
  await new Promise(r => chrome.exitCode !== null || chrome.signalCode !== null ? r() : chrome.once('exit', r));
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
};
chrome.on('error', async e => { console.error(`Could not start Chrome (${exe}): ${e.message}`); fs.rmSync(profile, { recursive: true, force: true }); process.exit(1); });
let ws;
try {
  let v; for (let i = 0; i < 50 && !v; i++) { await sleep(200); try { v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { } }
  if (!v) throw new Error('Chrome started but its debugging port never answered.');
  ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
  const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, sessionId);
  for (const size of [16, 32, 48, 128]) {
    await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false }, sessionId);
    const html = `<html><body style="margin:0;background:transparent">${svg.replace('width="64" height="64"', `width="${size}" height="${size}"`)}</body></html>`;
    await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') }, sessionId);
    await sleep(300);
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } }, sessionId);
    fs.writeFileSync(path.join(dir, `icon-${size}.png`), Buffer.from(data, 'base64'));
    console.log(`icon-${size}.png`);
  }
} finally {
  ws?.close();
  await cleanup();
}
