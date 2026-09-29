// Manual test driver for the extension, not part of `npm test`. It needs Google Chrome installed in its default
// place (tools/chrome.mjs), and Cardmarket and PostNL must already be logged in in the profile cm-labels/chrome-cdp
// under %LOCALAPPDATA% (Windows) or ~/Library/Application Support (macOS); log in once in a normal window of that profile.
// It starts Chrome with a CDP pipe, loads extension/ unpacked (Extensions.loadUnpacked needs
// --remote-debugging-pipe and --enable-unsafe-extension-debugging), opens app.html and runs the steps given on
// the command line, in order (Chrome stays open):
//   node tools/ext-test.mjs load cart:labels tab:settings shot:<png>
// Steps: load[:<order ids>], cart[:labels], tab:<run|settings|methods>, size:<W>x<H>, html:<template>, save,
// reload, read, printtest:<rotate>:<png>, js:<expression>, shot:<png>, probe.
//   cart = both cards, cart:labels = only the shipping labels.
// An unknown step or a failed step ends the run with exit code 1. Cardmarket's Cloudflare check loops in this
// pipe-launched Chrome, so test the Cardmarket part in a normal browser.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromeExe as exe, appDataDir } from './chrome.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profile = path.join(appDataDir, 'cm-labels', 'chrome-cdp');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now(); const say = m => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${m}`);

const STEPS = ['load', 'cart', 'tab', 'size', 'html', 'save', 'reload', 'read', 'printtest', 'js', 'shot', 'probe'];
const steps = process.argv.slice(2);
const unknown = steps.filter(s => !STEPS.includes(s.split(':')[0]));
if (unknown.length) { console.error(`unknown step: ${unknown.join(', ')}\nknown steps: ${STEPS.join(', ')}`); process.exit(1); }

const chrome = spawn(exe, [`--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], detached: true });
const out = chrome.stdio[3], inp = chrome.stdio[4];
let id = 0, buf = ''; const pending = new Map();
inp.on('data', d => {
  buf += d.toString();
  let i; while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); out.write(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0'); });

const { id: extId } = await send('Extensions.loadUnpacked', { path: path.join(root, 'extension') });
say(`extension loaded: ${extId}`);
const { targetId } = await send('Target.createTarget', { url: `chrome-extension://${extId}/app.html` });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const js = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
await sleep(1500);
let seen = 0;
const status = async () => js(`({ status: document.querySelector('#statustext').textContent, log: [...document.querySelector('#log').innerText.split('\\n')] })`);
async function waitIdle(ms = 600000) {
  for (const t = Date.now(); Date.now() - t < ms; await sleep(1000)) {
    const s = await status();
    const lines = s.log.filter(l => l && l !== 'Nothing yet.');
    for (const l of lines.slice(seen)) say(`  | ${l}`);
    seen = lines.length;
    if (!/^running/.test(s.status)) { say(`status: ${s.status}`); return s; }
  }
  throw new Error('timeout');
}
async function run(step) {
  const i = step.indexOf(':'), what = i < 0 ? step : step.slice(0, i), arg = i < 0 ? '' : step.slice(i + 1);
  say(`step ${step}`);
  if (what === 'load') await js(`(()=>{ const o=document.querySelector('#only'); o.value=${JSON.stringify(arg)}; o.dispatchEvent(new Event('input')); document.querySelector('#load').click(); return 'ok'; })()`);
  if (what === 'tab') { await js(`document.querySelector('nav button[data-tab="${arg}"]').click(), 'ok'`); await sleep(800); return; }
  if (what === 'size') { const [w, h] = arg.split('x'); await js(`(()=>{for (const [id,v] of [['#lw','${w}'],['#lh','${h}']]) { const e=document.querySelector(id); e.value=v; e.dispatchEvent(new Event('input')); } return 'ok'})()`); await sleep(500); return; }
  if (what === 'html') { await js(`(e=>{e.value=${JSON.stringify(arg)};e.dispatchEvent(new Event('input'));return 'ok'})(document.querySelector('#html'))`); await sleep(500); return; }
  if (what === 'save') { await js(`document.querySelector('#savesettings').click(), 'ok'`); await sleep(800); say('save: ' + await js(`document.querySelector('#settingsmsg').textContent`)); return; }
  if (what === 'reload') { await send('Page.reload', {}, sessionId); await sleep(2000); return; }
  if (what === 'read') { say('settings form: ' + await js(`JSON.stringify({w: document.querySelector('#lw').value, h: document.querySelector('#lh').value, html: document.querySelector('#html').value})`) + ' | storage: ' + await js(`chrome.storage.local.get('settings').then(s => JSON.stringify(s.settings))`)); return; }
  if (what === 'printtest') {
    // printtest:<rotate>:<png>  build the print HTML in the app page, print it to PDF (CSS page size), report the
    // PDF page size and take a screenshot of the page in print emulation
    const [rot, png] = [arg.slice(0, arg.indexOf(':')), arg.slice(arg.indexOf(':') + 1)];
    const html = await js(`import('./lib/labels.js').then(L => { const s = { width: 70, height: 40, rotate: ${+rot}, html: '' };
      const f = { NAME: 'Jan Jansen', ADDRESS: ['Voorbeeldstraat 12 B'], POSTCODE: '1234AB', CITY: 'Voorbeeldstad', COUNTRY: 'Netherlands' };
      return '<!doctype html><html><head><meta charset=utf-8><style>' + L.printCss(s) + '</style></head><body>' + L.pageHtml(f, s) + '</body></html>'; })`);
    const t = await send('Target.createTarget', { url: 'about:blank', background: true });
    const sid = (await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId;
    await send('Runtime.evaluate', { expression: `document.open(); document.write(${JSON.stringify(html)}); document.close(); 'ok'` }, sid);
    await sleep(500);
    const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true }, sid);
    const raw = Buffer.from(pdf.data, 'base64').toString('latin1');
    const box = (raw.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/) || []).slice(1).map(Number);
    say(`rotate ${rot}: PDF page ${box.length ? `${(box[2] * 25.4 / 72).toFixed(1)} x ${(box[3] * 25.4 / 72).toFixed(1)} mm` : '?'}`);
    const pw = +rot % 180 ? 40 : 70, ph = +rot % 180 ? 70 : 40, k = 96 / 25.4;
    await send('Emulation.setEmulatedMedia', { media: 'print' }, sid);
    await send('Emulation.setDeviceMetricsOverride', { width: Math.round(pw * k), height: Math.round(ph * k), deviceScaleFactor: 3, mobile: false }, sid);
    await sleep(300);
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sid);
    fs.writeFileSync(png, Buffer.from(data, 'base64')); say(`screenshot ${png}`);
    await send('Target.closeTarget', { targetId: t.targetId });
    return;
  }
  if (what === 'js') { say('js: ' + JSON.stringify(await js(arg)).slice(0, 600)); return; }
  if (what === 'shot') {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    fs.writeFileSync(arg, Buffer.from(data, 'base64')); say(`screenshot ${arg}`); return;
  }
  if (what === 'probe') {
    say('probe: ' + await js(`(async () => {
      const t = await chrome.tabs.create({ url: 'https://www.cardmarket.com/en/Magic/Orders/Sales/Paid', active: false });
      for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 500)); if ((await chrome.tabs.get(t.id)).status === 'complete') break; }
      const run = async world => (await chrome.scripting.executeScript({ target: { tabId: t.id }, world, func: async () => {
        const r = await fetch('/en/Magic/Orders/Sales/Paid', { credentials: 'include' });
        const h = await r.text();
        const d = new DOMParser().parseFromString(h, 'text/html');
        const txt = (d.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400);
        return JSON.stringify({ status: r.status, title: (h.match(/<title>([^<]*)/) || [])[1], pageTitle: document.title, pageLoggedIn: !!document.querySelector('a[href*="User_Logout"]'), txt });
      } }))[0].result;
      const out = 'ISOLATED ' + await run('ISOLATED');
      await chrome.tabs.remove(t.id);
      return out;
    })()`));
    return;
  }
  if (what === 'cart') await js(`(()=>{ for (const id of ['#pickcodes','#picklabels']) { const e=document.querySelector(id); if (!e.disabled) { e.checked=${JSON.stringify('ARG')}!=='labels'||id==='#picklabels'; e.dispatchEvent(new Event('change')); } } document.querySelector('#cart').click(); return 'ok'; })()`.replace('ARG', arg));
  await sleep(1500);
  const st = await waitIdle();
  if (/^failed/.test(st.status)) throw new Error(st.status);
  if (what === 'load') say('breakdown: ' + await js(`document.querySelector('#chips').innerText.replace(/\\n/g,' | ') + ' || stamp rows: ' + document.querySelectorAll('#stamps tr').length + ' || previews: ' + document.querySelectorAll('#previews figure').length`));
  if (what === 'cart') say('cart: ' + await js(`document.querySelector('#cartsummary').innerText + ' || ' + document.querySelector('#cartitems').innerText.replace(/\\n/g,' | ')`));
}
let code = 0;
for (const step of steps) {
  try { await run(step); } catch (e) { say(`FAILED step ${step}: ${e.message}`); code = 1; break; }
}
say(code ? 'failed; Chrome stays open' : 'done; Chrome stays open');
out.end(); inp.destroy(); chrome.unref(); process.exit(code);
