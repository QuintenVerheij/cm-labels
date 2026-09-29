// cm-labels app page: Load (Cardmarket) -> breakdown -> Print (browser print dialog) / Add to the carrier's cart
// The jobs run in this page, so keep it open while one runs.
import { ext } from './lib/ext.js';
import { esc } from './lib/esc.js';
import { loadSales, ORIGINS as LOAD_ORIGINS } from './lib/cardmarket.js';
import { planSales } from './lib/plan.js';
import { buildCart, abortedError, carrierName, carriersOf, methodCarriers, originsFor, accessOrigins, hostOf, BRACKETS } from './lib/carriers.js';
import { labelHtml, printLabels, fitLabels, pages, paper, effective, sheetOf, isSheet, perSheet, pageCount, printSummary, mm, PAPERS } from './lib/labels.js';
import { postcodeProblem } from './lib/postcode.js';
import { defaultTemplate } from './lib/template.js';
import { saveRun, getRun, clearRun, purgeStale, runAge, runScope, getSettings, getLang, loadOwnData, DEFAULTS } from './lib/store.js';
import { t, cartName, cartVars, setLang, resolveLang, applyI18n } from './lib/messages.js';

const $ = s => document.querySelector(s);
const eur = v => v == null ? '' : '€ ' + Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PX = 96 / 25.4;
const SAMPLE = { NAME: 'Jan Jansen', ADDRESS: ['Voorbeeldstraat 12 B'], POSTCODE: '1234AB', CITY: 'Voorbeeldstad', COUNTRY: 'Netherlands', ID: '1234567890' };

const state = { job: null, kind: null, progress: null, list: null, only: null, loadedAt: null, login: false, plan: null, cart: null, printed: null, error: null, log: [] };
let settings = { ...DEFAULTS };

// cls: the colour of the line ('e', 'g', 'y'); lines from the lib modules have none and get it from their text.
const log = (m, cls) => { state.log.push({ line: `${new Date().toLocaleTimeString('nl-NL')}  ${m}`, cls }); if (state.log.length > 800) state.log.shift(); render(); };
const cartOf = ids => cartName(ids.map(c => carrierName(c)));
const cartOfVars = ids => cartVars(ids.map(c => carrierName(c)));
const andList = names => names.join(t('list.and'));
const applyLang = () => { setLang(resolveLang(settings.uiLang, navigator.language)); applyI18n(document); if (methodsData && own) drawMethods(); };

// The data of the seller's country setting (NL when there are no files for it), as last loaded.
let own = null;
const loadOwn = async () => own = await loadOwnData();

async function run(kind, name, fn) {
  if (state.job) return;
  state.job = name; state.kind = kind; state.error = null; state.progress = null; render();
  await ext.storage.session?.set({ runLive: Date.now() }).catch(() => {});   // background.js does not reload this page while set
  try { await fn(); }
  catch (e) { state.error = e.message; log(t('log.failed', { name, message: e.message }), 'e'); }
  finally { state.job = null; state.kind = null; state.progress = null; state.login = false; await ext.storage.session?.remove('runLive').catch(() => {}); render(); }
}

// the order numbers in the "Specific order numbers" field (10 digits each), or null when it is empty
const onlyIds = () => { const ids = [...new Set($('#only').value.match(/\b\d{10}\b/g) || [])]; return ids.length ? ids : null; };
async function load(list, only) {
  Object.assign(state, { plan: null, cart: null, printed: null, list: null, only: null, loadedAt: null });
  await clearRun();   // a failed load leaves no earlier run behind
  const cfg = await loadOwn();
  const me = await ext.tabs.getCurrent();
  const sales = await loadSales(list, {
    lang: await getLang(), log, windowId: me.windowId, only, onProgress: (n, of) => { state.progress = [n, of]; renderProgress(); },
    onLogin: async on => { state.login = on; render(); if (!on) await ext.tabs.update(me.id, { active: true }); },
  });
  state.plan = planSales(sales, cfg, settings.country, BRACKETS);
  state.list = list; state.only = only; state.loadedAt = new Date();
  $('#pickcodes').checked = state.plan.stamps.length > 0;
  $('#picklabels').checked = state.plan.tracked.some(x => !x.error);
  await saveRun(list, state.plan, only);   // the panel in the Cardmarket page shows it too
  const p = state.plan;
  log(t('log.plan', { stamps: p.stampLine || '-', labels: p.print.length, tracked: p.tracked.length, byHand: p.skipped.length }));
}

// Only the selected cards go into the cart: Codes (stamp groups), Shipping labels (tracked sales).
const picked = (withCodes, withLabels) => ({ stamps: withCodes ? state.plan.stamps : [], tracked: withLabels ? state.plan.tracked.filter(x => !x.error) : [] });
async function cart({ stamps, tracked }) {
  settings = await getSettings();
  const me = await ext.tabs.getCurrent();
  state.cart = { running: true }; render();
  for (const c of carriersOf(stamps, tracked)) log(t('log.cartStart', { carrier: carrierName(c), codes: stamps.filter(g => g.carrier === c).length, labels: tracked.filter(p => p.carrier === c).length }));
  const started = Date.now();
  try {
    state.cart = await buildCart({ stamps, tracked, fallbackEmail: settings.fallbackEmail, windowId: me.windowId, log, onProgress: (n, of, it) => { state.progress = [n, of, it]; renderProgress(); } });
  } catch (e) { state.cart = { carts: [], error: e.message, seconds: 0 }; throw e; }
  state.cart.seconds = Math.round((Date.now() - started) / 100) / 10;
  const failed = abortedError(state.cart);
  if (failed) throw new Error(failed);   // the run shows as failed; the carts that were made still show
  const merged = state.cart.carts.filter(c => c.merged).length;
  log(`${t('log.cartDone', { names: andList(state.cart.carts.map(c => carrierName(c.carrier))), seconds: state.cart.seconds })}${merged === 1 ? ' ' + t('log.cartFront') : merged ? ' ' + t('log.cartEach') : ''}`, 'g');
}
// The carriers the cart button is for: the chosen items', else all items', else the ones the seller's methods name.
function cartCarriers(p, withCodes, withLabels) {
  const ok = p ? p.tracked.filter(x => !x.error) : [];
  const picked = p ? carriersOf(withCodes ? p.stamps : [], withLabels ? ok : []) : [];
  if (picked.length) return picked;
  const all = p ? carriersOf(p.stamps, ok) : [];
  return all.length ? all : methodCarriers(own?.methods);
}
// The line under the cart items: one per carrier when there are several.
function cartSummary(c) {
  if (c.error) return `${esc(c.error)} ${t('cart.nothing')}`;
  if (!c.carts.length) return t('cart.nothing');
  const multi = c.carts.length > 1;
  const one = k => {
    const name = carrierName(k.carrier);
    const text = k.merged ? `${t('cart.merged', { count: k.count, total: eur(k.total) })}${k.check ? '' : ` <span class="bad">${t('cart.expected', { expected: eur(k.expected) })}</span>`}${multi ? '.' : t('cart.inSeconds', { seconds: c.seconds })}`
      : k.error ? `${esc(k.error)} ${t('cart.noTabClosed', { name: esc(name) })}` : t('cart.failedKeep');
    return multi ? `<b>${esc(name)}</b>: ${text}` : text;
  };
  return c.carts.map(one).join('<br>') + (multi && c.carts.some(k => k.merged) ? `<br>${t('cart.doneMulti', { seconds: c.seconds })}` : '');
}

// ---------------------------------------------------------------- render
let lastKey = '';
function renderLog() {
  const el = $('#log'), atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
  el.innerHTML = state.log.map(({ line: l, cls }) => { const e = esc(l), c = cls ?? (/FAILED|ERROR|CHECK THE CART/.test(l) ? 'e' : /in its cart|Cart:|done|Logged in/.test(l) ? 'g' : /manual address|suffix|guess|Not logged in|cookie/i.test(l) ? 'y' : ''); return c ? `<span class="${c}">${e}</span>` : e; }).join('\n') || t('log.empty');
  if (atEnd) el.scrollTop = el.scrollHeight;
}
function addressText(row) {
  if (row.error) return '';
  if (row.Iso === 'NL' || (row.Iso === settings.country && row.Manual)) return `${esc(row.Street)} ${esc(row.Number)}${row.Suffix ? ` <span class="tag">${esc(row.Suffix)}</span>` : ''}${row.Iso !== 'NL' && row.Extra ? `<br>${esc(row.Extra)}` : ''}<br>${esc(row.Postcode)} ${esc(row.Town)}`;
  const m = row.Manual;
  const man = m ? `<br><span class="hint">${t('addr.manual')} ${esc(m.Street)} · ${esc(m.Nr)}${m.Ext ? ' ' + esc(m.Ext) : ''}${Object.entries(m.Fields || {}).map(([f, v]) => ` · ${esc(f)}: ${esc(v)}`).join('')}</span>` : '';
  return `${esc(row.AddressLine)}<br>${esc(row.Postcode)} ${esc(row.Town)}${man}`;
}
// Label preview: the label HTML at print size, scaled down to fit a box.
function previewFigure(fields, caption, max = 240) {
  const e = effective(settings), W = e.width, H = e.height, s = Math.min(1, max / (W * PX), max / (H * PX));
  return `<figure><div class="frame" style="width:${(W * PX * s).toFixed(0)}px;height:${(H * PX * s).toFixed(0)}px"><div style="transform:scale(${s});transform-origin:0 0">${labelHtml(fields, settings)}</div></div>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
}
function renderPreviews() {
  const p = state.plan;
  $('#prevcount').textContent = p.print.length;
  const sheet = isSheet(settings), e = effective(settings), g = sheetOf(settings);
  $('#prevsize').textContent = sheet ? t('prev.sheet', { w: mm(e.width), h: mm(e.height), cols: g.cols, rows: g.rows, sheets: pageCount(p.print, settings) }) : `${settings.width}×${settings.height} mm`;
  $('#startwrap').hidden = !sheet;
  if (sheet) { $('#start').max = perSheet(settings); $('#start').value = Math.min(Math.max(1, g.start || 1), perSheet(settings)); }
  $('#previews').classList.toggle('sheetview', sheet);
  $('#previews').classList.toggle('pick', sheet);
  $('#previews').innerHTML = sheet
    ? sheetFigures(p.print, settings, 340, (i, n) => t(i === 0 ? 'sheet.captionFirst' : 'sheet.caption', { i: i + 1, n }))
    : p.print.map(o => previewFigure(o.Fields, o.Id)).join('');
  if (!$('#previews').hidden) fitLabels($('#previews'));
}
// Sheet mode: the first free position on the first sheet (click a cell of sheet 1, or type it)
async function setStart(n) {
  const max = perSheet(settings), start = Math.min(Math.max(1, Math.round(+n) || 1), max);
  await saveSettings({ sheet: { ...sheetOf(settings), start } });
  lastKey = ''; render();
}
const trackedCarriers = p => carriersOf([], p.tracked).filter(c => c !== 'none').map(c => carrierName(c)).join(' / ') || t('tbl.carrier');
function renderPlan() {
  const p = state.plan;
  $('#result').hidden = !p || $('nav button.on').dataset.tab !== 'run';
  if (!p) return;
  const key = `${state.loadedAt}|${settings.width}|${settings.height}|${settings.html}|${JSON.stringify(settings.sheet || {})}`;
  if (key !== lastKey) {
    lastKey = key;
    $('#resulttitle').textContent = t('result.titleFull', { scope: runScope(state.only, t('scope.paid')), at: state.loadedAt.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }), age: runAge(state.loadedAt) });
    const nStamps = p.stamps.reduce((a, g) => a + g.qty, 0);
    $('#chips').innerHTML = [t('chip.sales', { n: p.count }), t('chip.labels', { n: p.print.length }), t('chip.stamps', { n: nStamps }), t('chip.tracked', { n: p.tracked.length }), t('chip.byHand', { n: p.skipped.length })].map(c => `<span class="chip">${c}</span>`).join('');
    $('#stamps').innerHTML = p.stamps.length ? `<thead><tr><th>${t('tbl.code')}</th><th>${t('tbl.country')}</th><th class="num">${t('tbl.weight')}</th><th class="num">${t('tbl.qty')}</th><th>${t('tbl.sales')}</th></tr></thead><tbody>${p.stamps.map(g => `<tr><td class="mono">${g.code}</td><td>${esc(g.country)}</td><td class="num">${g.weight} g</td><td class="num">${g.qty}</td><td class="mono">${g.ids.join(', ')}</td></tr>`).join('')}</tbody>` : `<tbody><tr><td class="hint">${t('tbl.none')}</td></tr></tbody>`;
    $('#tracked').innerHTML = p.tracked.length ? `<thead><tr><th>${t('tbl.sale')}</th><th>${t('tbl.to')}</th><th>${trackedCarriers(p)}</th><th>${t('tbl.recipient')}</th><th>${t('tbl.address')}</th><th>${t('tbl.phone')}</th><th>${t('tbl.email')}</th><th>${t('tbl.notes')}</th></tr></thead><tbody>${p.tracked.map(r => `<tr>
      <td class="mono">${r.Id}<br><span class="hint">${eur(r.value)}</span></td><td>${esc(r.Iso)}</td>
      <td>${esc(r.Product)}<br>${esc(r.Option)}${r.Grams ? `<br><span class="hint">${t('tbl.max', { g: r.Grams })}</span>` : ''}${r.Seen === 'guess' ? ` <span class="tag bad">${t('tbl.guess')}</span>` : ''}</td>
      <td>${r.error ? esc(r.address?.[0]) : `${esc(r.First)} ${esc(r.Last)}`}</td><td>${addressText(r)}</td>
      <td class="mono">${esc(r.Phone || '')}</td><td class="mono">${esc(r.Email || '')}</td>
      <td>${r.error ? `<span class="bad">${esc(r.error)}</span><br><span class="hint">${esc((r.address || []).join(' | '))}</span>` : ''}${(r.warnings || []).map(w => `<div class="warn">${esc(w)}</div>`).join('')}</td></tr>`).join('')}</tbody>` : `<tbody><tr><td class="hint">${t('tbl.none')}</td></tr></tbody>`;
    $('#skippedwrap').hidden = !p.skipped.length;
    $('#skipped').innerHTML = `<tbody>${p.skipped.map(x => `<tr><td class="mono">${x.id}</td><td>${esc(x.iso || '')}</td><td>${esc(x.method || '')}</td><td class="warn">${esc(x.reason)}</td><td class="hint">${esc((x.address || []).join(' | '))}</td></tr>`).join('')}</tbody>`;
    const nCodes = p.stamps.length, nLabels = p.tracked.filter(x => !x.error).length, nBad = p.tracked.length - nLabels;
    $('#codesinfo').textContent = nCodes ? t('info.codes', { stamps: nStamps, codes: nCodes, line: p.stampLine }) : t('info.none');
    $('#labelsinfo').textContent = nLabels ? nBad ? t('info.labelsBad', { n: nLabels, bad: nBad }) : t('info.labels', { n: nLabels }) : t('info.none');
    renderPreviews();
  }
  const busy = !!state.job, paid = state.list === 'Paid';
  $('#print').disabled = busy || !paid || !p.print.length;
  $('#print').title = paid ? t('print.title', { summary: printSummary(p.print, settings) }) : t('print.onlyPaid');
  const nCodes = p.stamps.length, nLabels = p.tracked.filter(x => !x.error).length;
  $('#pickcodes').disabled = busy || !nCodes; if (!nCodes) $('#pickcodes').checked = false;
  $('#picklabels').disabled = busy || !nLabels; if (!nLabels) $('#picklabels').checked = false;
  $('#cart').disabled = busy || !paid || !($('#pickcodes').checked || $('#picklabels').checked);
  $('#cart').title = paid ? '' : t('print.onlyPaid');
  $('#cart').textContent = t('cart.add', cartOfVars(cartCarriers(p, $('#pickcodes').checked, $('#picklabels').checked)));
  const c = state.cart;
  $('#cartresult').hidden = !c || c.running;
  if (c && !c.running) {
    const title = cartOf(c.carts.length ? c.carts.map(k => k.carrier) : cartCarriers(p, true, true));
    $('#cartresult h3').textContent = title[0].toUpperCase() + title.slice(1);
    const row = i => `<tr><td class="mono">${esc(i.key)}</td><td>${i.ok ? `<span class="ok">${t('cartrow.in')}</span>${i.manual ? ` <span class="tag warn">${t('cartrow.manual')}</span>` : ''}` : `<span class="bad">${esc(i.error)}</span>`}</td><td class="num">${eur(i.total)}</td><td class="num">${i.ms != null ? (i.ms / 1000).toFixed(1) + ' s' : ''}</td></tr>`;
    const multi = c.carts.length > 1;
    $('#cartitems').innerHTML = `<thead><tr><th>${t('tbl.item')}</th><th>${t('tbl.result')}</th><th class="num">${t('tbl.price')}</th><th class="num">${t('tbl.time')}</th></tr></thead><tbody>${c.carts.map(k => (multi ? `<tr><th colspan="4">${esc(carrierName(k.carrier))}</th></tr>` : '') + k.items.map(row).join('')).join('')}</tbody>`;
    $('#cartsummary').innerHTML = cartSummary(c);
  }
}
// Progress bars while a job runs, as in the Cardmarket panel: loading under the load button (per sale), the
// carrier carts under the cart row (per step; the text counts the finished items).
function renderProgress() {
  const el = state.kind === 'cart' ? $('#cartprogress') : state.kind === 'load' ? $('#loadprogress') : null;
  for (const p of [$('#loadprogress'), $('#cartprogress')]) p.hidden = p !== el;
  if (!el) return;
  const [n, of, it] = state.progress || [0, 0];
  el.querySelector('.progresstext').textContent = `${state.job}…${it ? ` ${it.items}/${it.of}` : of ? ` ${n}/${of}` : ''}`;
  el.querySelector('.pbar i').style.width = `${of ? Math.round(100 * n / of) : 0}%`;
}
function render() {
  $('#dot').className = state.job ? 'run' : state.error ? 'bad' : state.plan ? 'ok' : '';
  $('#statustext').textContent = state.job ? t('status.running', { job: state.job }) : state.error ? t('status.failed', { error: state.error }) : state.plan ? t('status.ready') : t('status.idle');
  $('#load').disabled = !!state.job || !$('#access').hidden;
  $('#login').hidden = !state.login;
  renderAccess();
  renderProgress();
  renderLog();
  renderPlan();
}

// ---------------------------------------------------------------- settings
// html '' = the default layout, made from the label size (so it follows the size). In sheet mode the label size
// is the cell size: paper size / columns, rows.
const num = id => +$(id).value.replace(',', '.');
const paperMode = () => document.querySelector('input[name=papermode]:checked')?.value || 'printer';
const formSize = () => ({
  width: num('#lw'), height: num('#lh'), rotate: +$('#rotate').value,
  sheet: { ...sheetOf(settings), on: paperMode() === 'sheet', paperW: num('#pw'), paperH: num('#ph'), cols: Math.round(num('#cols')), rows: Math.round(num('#rows')) },
});
// null = the form is valid; else the reason
function sizeProblem(f) {
  if (!f.sheet.on) return f.width >= 15 && f.width <= 300 && f.height >= 15 && f.height <= 300 ? null : t('size.label');
  const g = f.sheet;
  if (!(g.paperW >= 50 && g.paperW <= 1000 && g.paperH >= 50 && g.paperH <= 1000)) return t('size.paper');
  if (!(g.cols >= 1 && g.cols <= 12 && g.rows >= 1 && g.rows <= 30)) return t('size.grid');
  if (g.paperW / g.cols < 10 || g.paperH / g.rows < 10) return t('size.cell');
  return null;
}
const defaultFor = f => { const e = effective(f); return defaultTemplate(e.width, e.height); };
// Sheet preview: the pages at print size, scaled into a box. Numbers mark the positions (screen only).
function sheetFigures(orders, s, max, caption) {
  const { w, h } = paper(s), e = effective(s), k = Math.min(1, max / (w * PX), max / (h * PX));
  const size = Math.min(e.width, e.height) * 0.42;
  const mark = (i, kind) => `<span class="cellno ${kind}" style="font-size:${size.toFixed(2)}mm">${i}</span>`;
  const list = pages(orders, s, mark);
  return list.map((pg, i) => `<figure class="sheetfig"><div class="frame" style="width:${(w * PX * k).toFixed(0)}px;height:${(h * PX * k).toFixed(0)}px"><div style="transform:scale(${k});transform-origin:0 0">${pg}</div></div>${caption ? `<figcaption>${esc(caption(i, list.length))}</figcaption>` : ''}</figure>`).join('');
}
function renderSheetForm() {
  const f = formSize(), sheet = f.sheet.on;
  $('#printerfields').hidden = sheet; $('#sheetfields').hidden = !sheet;
  $('#pw').disabled = $('#ph').disabled = $('#paper').value !== 'custom';
  if (!sheet) return;
  const bad = sizeProblem(f), e = effective(f);
  $('#sheetinfo').textContent = bad || t('sheet.info', { w: mm(e.width), h: mm(e.height), n: f.sheet.cols * f.sheet.rows });
  $('#sheetinfo').classList.toggle('bad', !!bad);
  if (!bad) $('#sheetgrid').innerHTML = sheetFigures([], { ...f, sheet: { ...f.sheet, start: 1 } }, 220);
}
function htmlPreview() {
  const f = formSize();
  renderSheetForm();
  if (sizeProblem(f)) return;
  const saved = settings;
  settings = { ...settings, ...f, html: $('#html').value };
  try {
    $('#htmlpreview').innerHTML = previewFigure(SAMPLE, '', 320).replace(/^<figure>|<\/figure>$/g, '');
    fitLabels($('#htmlpreview'));
  } finally { settings = saved; }
}
// own: the layout is the user's own (it does not follow the label size)
const showLayoutNote = own => { $('#htmlinfo').dataset.own = own ? '1' : ''; $('#htmlinfo').textContent = t(own ? 'layout.own' : 'layout.def'); };
const paperName = g => Object.keys(PAPERS).find(k => PAPERS[k][0] === +g.paperW && PAPERS[k][1] === +g.paperH) || 'custom';
function fillSettingsForm() {
  const g = sheetOf(settings);
  $('#lw').value = settings.width; $('#lh').value = settings.height; $('#rotate').value = String(settings.rotate || 0); $('#femail').value = settings.fallbackEmail; $('#shopcountry').value = settings.country; $('#shoppostcode').value = settings.postcode;
  for (const r of document.querySelectorAll('input[name=papermode]')) r.checked = r.value === (g.on ? 'sheet' : 'printer');
  $('#paper').value = paperName(g); $('#pw').value = g.paperW; $('#ph').value = g.paperH; $('#cols').value = g.cols; $('#rows').value = g.rows;
  $('#html').value = settings.html || defaultFor(settings);
  $('#uilang').value = settings.uiLang;
  showLayoutNote(!!settings.html);
  htmlPreview();
}
async function loadSettings() {
  settings = await getSettings();   // also migrates the old return-address setting once
  applyLang();
  fillSettingsForm();
}
async function saveSettings(patch) { settings = { ...settings, ...patch }; await ext.storage.local.set({ settings }); }
// a size change: a default layout follows the (cell) size while you type
function sizeChanged() {
  const f = formSize();
  if (!$('#htmlinfo').dataset.own && !sizeProblem(f)) $('#html').value = defaultFor(f);
  htmlPreview();
}
for (const id of ['#lw', '#lh', '#pw', '#ph', '#cols', '#rows']) $(id).addEventListener('input', sizeChanged);
for (const r of document.querySelectorAll('input[name=papermode]')) r.addEventListener('change', sizeChanged);
$('#paper').addEventListener('change', () => {
  const p = PAPERS[$('#paper').value];
  if (p) { $('#pw').value = p[0]; $('#ph').value = p[1]; }
  sizeChanged();
});
$('#rotate').addEventListener('change', htmlPreview);
$('#html').addEventListener('input', () => { showLayoutNote(true); htmlPreview(); });
$('#htmldefault').onclick = () => {
  const f = formSize();
  $('#html').value = sizeProblem(f) ? defaultTemplate(70, 40) : defaultFor(f);
  showLayoutNote(false);
  htmlPreview();
};
$('#savesettings').onclick = async () => {
  const f = formSize(), femail = $('#femail').value.trim(), html = $('#html').value.trim();
  const bad = sizeProblem(f);
  if (bad) { $('#settingsmsg').textContent = bad; return; }
  if (femail && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(femail)) { $('#settingsmsg').textContent = t('msg.email'); return; }
  const pcBad = postcodeProblem($('#shopcountry').value, $('#shoppostcode').value.trim());
  if (pcBad) { $('#settingsmsg').textContent = pcBad; return; }
  if (!html) { $('#settingsmsg').textContent = t('msg.layoutEmpty'); return; }
  // the default layout is stored as '' so that it keeps following the label size
  const isDefault = html === defaultFor(f).trim();
  // a new grid: start again at position 1
  const old = sheetOf(settings);
  if (f.sheet.cols !== old.cols || f.sheet.rows !== old.rows) f.sheet.start = 1;
  await saveSettings({ ...f, uiLang: $('#uilang').value, fallbackEmail: femail, country: $('#shopcountry').value, postcode: $('#shoppostcode').value.trim().toUpperCase(), html: isDefault ? '' : html });
  const e = effective(f);
  applyLang();
  const where = f.sheet.on ? t('saved.sheet', { cols: f.sheet.cols, rows: f.sheet.rows, w: mm(e.width), h: mm(e.height), pw: mm(f.sheet.paperW), ph: mm(f.sheet.paperH) })
    : f.rotate ? t('saved.turned', { w: f.width, h: f.height, r: f.rotate, pageW: f.rotate % 180 ? f.height : f.width, pageH: f.rotate % 180 ? f.width : f.height }) : t('saved.printer', { w: f.width, h: f.height });
  $('#settingsmsg').textContent = t('saved.msg', { where, kind: t(isDefault ? 'saved.default' : 'saved.own') });
  await loadOwn().catch(() => {});
  fillSettingsForm();
  onlyInfo();
  if (methodsData) drawMethods();
  lastKey = '';
  render();
};

// ---------------------------------------------------------------- methods
let methodsData;
async function loadMethods() {
  const d = await loadOwn();
  if (methodsData !== d) {
    methodsData = d;
    const have = new Set(d.rates.map(r => r.Iso));
    $('#country').innerHTML = Object.entries(d.countries).filter(([iso]) => have.has(iso)).sort().map(([iso, v]) => `<option value="${iso}">${esc(v[0])} (${iso})</option>`).join('');
    $('#country').value = 'DE';
    $('#country').onchange = drawMethods;
  }
  drawMethods();
}
function drawMethods() {
  const nl = own.origin === 'NL';
  $('#methodstitle').textContent = nl ? t('methods.title') : t('methods.titleOther');
  $('#methodshint').textContent = t('methods.hint', { origin: own.origin, carrier: nl ? 'PostNL' : t('methods.carrierAny') });
  const iso = $('#country').value, rates = methodsData.rates.filter(r => r.Iso === iso);
  $('#mtable').innerHTML = `<thead><tr><th>${t('mt.method')}</th><th>${t('mt.service')}</th><th>${t('mt.carrier')}</th><th>${own.origin === 'NL' ? t('mt.product') : t('mt.productOther')}</th><th>${t('mt.seen')}</th><th class="num">${t('mt.maxValue')}</th><th class="num">${t('mt.maxWeight')}</th><th class="num">${t('mt.price')}</th><th class="num">${t('mt.days')}</th></tr></thead><tbody>${[...new Set(rates.map(r => r.Method))].map(name => {
    const m = methodsData.methods[name] || { Service: '?', Carrier: '?' }, rs = rates.filter(r => r.Method === name);
    return `<tr><td>${esc(name)}</td><td><span class="tag">${esc(m.Service)}</span></td><td><span class="tag">${esc(m.Carrier)}</span></td><td>${m.Service === 'tracked' || m.Service === 'postnl' ? `${esc(m.Product)} · ${esc(m.Option)}` : ''}</td><td>${m.Seen ? `<span class="tag ${m.Seen === 'guess' ? 'bad' : ''}">${m.Seen === 'guess' ? t('tbl.guess') : m.Seen}</span>` : ''}</td>
      <td class="num">${eur(rs[0].MaxValue)}</td><td class="num">${rs.map(r => r.MaxWeight + ' g').join('<br>')}</td><td class="num">${rs.map(r => eur(r.Price)).join('<br>')}</td><td class="num">${rs[0].Days}</td></tr>`;
  }).join('')}</tbody>`;
}

// ---------------------------------------------------------------- wiring
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== b.dataset.tab || (p.id === 'result' && !state.plan));
  if (b.dataset.tab === 'methods') loadMethods();
  if (b.dataset.tab === 'run') fitLabels($('#previews'));
  if (b.dataset.tab === 'settings') fillSettingsForm();
});
$('#load').onclick = () => { const only = onlyIds(); run('load', only ? t('job.loadN', { n: only.length }) : t('job.load'), () => load('Paid', only)); };
const onlyInfo = () => {
  const only = onlyIds(), extra = ($('#only').value.match(/\d+/g) || []).filter(n => n.length !== 10);
  $('#onlyinfo').textContent = (only ? t('only.only', { ids: only.join(', ') }) : '') + (extra.length ? `${only ? '. ' : ''}${t('only.skipped', { ids: extra.join(', ') })}` : '');
};
$('#only').addEventListener('input', onlyInfo);
$('#prevtoggle').onclick = () => {
  const open = $('#prevtoggle').getAttribute('aria-expanded') !== 'true';
  $('#prevtoggle').setAttribute('aria-expanded', String(open));
  $('#previews').hidden = !open;
  if (open) fitLabels($('#previews'));   // hidden previews have no layout to fit
};
// Printing happens only here: after a load of the Paid list, when you click the button. The browser's print
// dialog opens; nothing prints until you confirm there.
$('#print').onclick = () => {
  if (state.job || state.list !== 'Paid' || !state.plan?.print.length) return;
  run('print', t('job.print'), async () => {
    log(t('log.print', { summary: printSummary(state.plan.print, settings) }));
    await printLabels(state.plan.print, settings);
    state.printed = new Date();
    log(t('log.printClosed'));
  });
};
$('#start').addEventListener('change', () => setStart($('#start').value));
$('#previews').addEventListener('click', e => {
  const cell = e.target.closest('.cml-cell');
  if (!cell || !isSheet(settings) || state.job || cell.closest('.cml-page') !== $('#previews .cml-page')) return;
  setStart(cell.dataset.cell);
});
for (const id of ['#pickcodes', '#picklabels']) $(id).onchange = () => render();
$('#cart').onclick = async () => {
  const withCodes = $('#pickcodes').checked, withLabels = $('#picklabels').checked;
  if (state.job || state.list !== 'Paid' || (!withCodes && !withLabels)) return;
  // The shops of this cart's carriers, and no others. Asked for first, before any await, while the click still
  // counts as the user's (Firefox and Chrome require that); already granted, the browser answers without a prompt.
  const items = picked(withCodes, withLabels), origins = originsFor(carriersOf(items.stamps, items.tracked));
  if (origins.length) {
    let granted = false;
    try { granted = await ext.permissions.request({ origins }); } catch (e) { state.error = t('log.permFailed', { message: e.message }); log(state.error, 'e'); return; }
    if (!granted) { state.error = t('log.permDenied', { hosts: andList(origins.map(hostOf)) }); log(state.error, 'e'); return; }
  }
  if ((state.cart?.error || state.cart?.carts?.some(c => c.merged || c.error)) && !confirm(t('confirm.again'))) return;
  run('cart', t('job.cart', cartOfVars(cartCarriers(state.plan, withCodes, withLabels))), () => cart(items));
};
window.addEventListener('beforeunload', e => { if (state.job) { e.preventDefault(); e.returnValue = ''; } });

// Host permissions can be missing (Firefox lets the user turn them off). Load needs only Cardmarket's: the banner
// shows while that one is missing, and its button asks for it with the shops of the seller's own carriers, from a
// click. A cart asks for its own carriers' shops from the cart click.
const grantOrigins = () => accessOrigins(LOAD_ORIGINS, own?.methods);
function renderAccess() {
  const shops = methodCarriers(own?.methods).filter(c => originsFor([c]).length);
  $('#accessnote').textContent = shops.length ? t('access.notice', { carriers: andList(shops.map(c => carrierName(c))) }) : t('access.noticeLoad');
  $('#grant').textContent = t('access.grant', { hosts: andList(grantOrigins().map(hostOf)) });
}
async function checkAccess() {
  const ok = await ext.permissions.contains({ origins: LOAD_ORIGINS }).catch(() => true);
  $('#access').hidden = ok;
  render();
  return ok;
}
$('#grant').onclick = async () => { try { await ext.permissions.request({ origins: grantOrigins() }); } catch (e) { log(t('log.permFailed', { message: e.message })); } await checkAccess(); };

await loadSettings();
await loadOwn().catch(() => {});   // the carriers of the methods name the cart button before any load
await purgeStale();
// the last load (also one made in the Cardmarket page panel), if it is recent
const last = await getRun();
if (last) {
  Object.assign(state, { plan: last.plan, list: last.list, only: last.only || null, loadedAt: last.loadedAt });
  $('#pickcodes').checked = last.plan.stamps.length > 0;
  $('#picklabels').checked = last.plan.tracked.some(x => !x.error);
}
render();
await checkAccess();
