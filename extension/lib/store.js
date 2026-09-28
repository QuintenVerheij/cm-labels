// Settings and the last run, in storage.local: shared by the app page, the panel in the Cardmarket page and the
// print page.
import { ext } from './ext.js';

// html '' = the default layout, made from the label size (so it scales when the size changes)
export const DEFAULTS = { width: 70, height: 40, rotate: 0, html: '', fallbackEmail: '', list: 'Paid' };

// One-time migration from the ZPL settings (up to 1.6): the ZPL layout is gone, and so is the return-address
// setting. A return address that was set becomes part of an own HTML template (the default 4 lines, centred above
// a small return line), so nothing changes on the label.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function templateWithReturn(W, H, text) {
  const size = Math.max(2.5, Math.min(8, (H - 8) / 4 / 1.25)).toFixed(1);
  return `<div style="position:relative; height:100%">
  <div style="position:absolute; left:0; right:0; top:0; bottom:4mm; box-sizing:border-box; padding:2mm; display:flex; flex-direction:column; justify-content:center;
       font:700 ${size}mm/1.2 'Segoe UI', Arial, sans-serif; white-space:nowrap">
    <div class="fit">{NAME}</div>
    <div class="fit">{ADDRESS}</div>
    <div class="fit">{POSTCODE} {CITY}</div>
    <div class="fit">{COUNTRY}</div>
  </div>
  <div class="fit" style="position:absolute; left:2mm; right:2mm; bottom:1.5mm; text-align:center; font:400 1.9mm/1.2 'Segoe UI', Arial, sans-serif; white-space:nowrap">${esc(text)}</div>
</div>`;
}
async function migrate(s) {
  if (!('zpl' in s) && !('returnAddress' in s)) return s;
  const out = { ...s };
  if (s.returnAddress && !s.html) out.html = templateWithReturn(s.width || DEFAULTS.width, s.height || DEFAULTS.height, s.returnAddress);
  delete out.zpl; delete out.returnAddress;
  await ext.storage.local.set({ settings: out });
  return out;
}
export async function getSettings() { return { ...DEFAULTS, ...(await migrate((await ext.storage.local.get('settings')).settings || {})) }; }
export async function setSettings(s) { await ext.storage.local.set({ settings: s }); }

// The last load: the full page shows the panel's run and the other way round.
const MAX_AGE = 12 * 3600 * 1000;
export async function saveRun(list, plan, only = null) { await ext.storage.local.set({ lastRun: { list, plan, only, loadedAt: new Date().toISOString() } }); }
export async function clearRun() { await ext.storage.local.remove('lastRun'); }
export async function getRun() {
  const r = (await ext.storage.local.get('lastRun')).lastRun;
  if (!r) return null;
  if (!(Date.now() - Date.parse(r.loadedAt) < MAX_AGE)) { await clearRun(); return null; }   // buyer data does not outlive the cache
  return { ...r, loadedAt: new Date(r.loadedAt) };
}
// The print page takes a print job within seconds; one that is still there was never opened.
const JOB_MAX_AGE = 10 * 60 * 1000;
export async function purgeStale() {
  const job = (await ext.storage.local.get('printJob')).printJob;
  if (job && !(Date.now() - job.at < JOB_MAX_AGE)) await ext.storage.local.remove('printJob');
  await getRun();
}
// Age and scope of a restored run, for the line above the breakdown.
export function runAge(loadedAt, now = Date.now()) {
  const min = Math.max(0, Math.floor((now - +loadedAt) / 60000));
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${min % 60} min ago`;
}
export const runScope = (only, all) => only?.length ? `${only.length} chosen order${only.length === 1 ? '' : 's'}` : all;

// The data files of the extension (methods, countries, rates).
let data = null;
export async function loadData() {
  if (data) return data;
  const get = async n => (await fetch(ext.runtime.getURL(`data/${n}.json`))).json();
  const [methods, countries, rates] = await Promise.all([get('methods'), get('countries'), get('rates')]);
  data = { methods, countries, rates, byName: Object.fromEntries(Object.entries(countries).map(([iso, v]) => [v[0], iso])) };
  return data;
}
