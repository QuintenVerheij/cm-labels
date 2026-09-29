// Settings and the last run, in storage.local: shared by the app page, the panel in the Cardmarket page and the
// print page.
import { ext } from './ext.js';
import { esc } from './esc.js';
import { byNameOf } from './locale.js';
import { t } from './messages.js';

// media: 'label' (die-cut labels) or 'roll' (continuous roll: height = cut length, feed = mm of blank space after each label)
// html '' = the default layout, made from the label size (so it scales when the size changes)
// uiLang: the interface language, 'auto' (the browser's), 'en' or 'de'
export const DEFAULTS = { width: 70, height: 40, rotate: 0, media: 'label', feed: 0, html: '', fallbackEmail: '', country: 'NL', postcode: '', uiLang: 'auto' };

// Migration of the old settings: a stored return address becomes part of an own HTML template (the default 4
// lines, centred above a small return line); the keys of the old settings are dropped.
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

// The last load: the full page shows the panel's run and the other way round.
const MAX_AGE = 12 * 3600 * 1000;
// sales: the sales as loaded, which the orders table lists and which the plan is made from again when an order is deleted.
// loadedAt: keeps the time of the load when the plan is made again.
export async function saveRun(list, plan, only = null, sales = null, loadedAt = null) {
  await ext.storage.local.set({ lastRun: { list, plan, only, sales, loadedAt: new Date(loadedAt || Date.now()).toISOString() } });
}
export async function clearRun() { await ext.storage.local.remove('lastRun'); }
export async function getRun() {
  const r = (await ext.storage.local.get('lastRun')).lastRun;
  if (!r) return null;
  if (!(Date.now() - Date.parse(r.loadedAt) < MAX_AGE)) { await clearRun(); return null; }   // buyer data does not outlive the cache
  return { ...r, plan: withCarrier(r.plan), loadedAt: new Date(r.loadedAt) };
}
// A run saved before stamp groups and tracked labels named their carrier: every such run was PostNL's.
export function withCarrier(plan) {
  if (!plan) return plan;
  const out = { ...plan };
  for (const k of ['stamps', 'tracked']) if (Array.isArray(plan[k])) out[k] = plan[k].map(x => x.carrier ? x : { ...x, carrier: 'postnl' });
  return out;
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
  return min < 1 ? t('age.now') : min < 60 ? t('age.min', { min }) : t('age.hour', { h: Math.floor(min / 60), min: min % 60 });
}
export const runScope = (only, all) => only?.length ? t('scope.chosen', { n: only.length }) : all;

// The language of the Cardmarket pages the user browses; the app page has no Cardmarket page of its own to read it from.
export const saveLang = lang => ext.storage.local.set({ cmLang: lang });
export const getLang = async () => (await ext.storage.local.get('cmLang')).cmLang || 'en';

// The data files of the extension (methods, countries, rates) for one origin country; NL's files carry no suffix.
const data = {};
export async function loadData(origin) {
  if (data[origin]) return data[origin];
  const get = async n => (await fetch(ext.runtime.getURL(`data/${n}${origin === 'NL' ? '' : '.' + origin}.json`))).json();
  const [methods, countries, rates] = await Promise.all([get('methods'), get('countries'), get('rates')]);
  return data[origin] = { origin, methods, countries, rates, byName: byNameOf(countries) };
}
// The countries that have data files (the origins tools/build-data.mjs emits).
const ORIGINS_WITH_DATA = ['NL', 'DE'];
// The data of the seller's country setting; NL for a country without files. A failed fetch for a country with files throws.
export async function loadOwnData() {
  const { country } = await getSettings();
  return loadData(ORIGINS_WITH_DATA.includes(country) ? country : 'NL');
}
