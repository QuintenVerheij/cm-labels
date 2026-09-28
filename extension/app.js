// cm-labels app page: Load (Cardmarket) -> breakdown -> Print (browser print dialog) / Add to PostNL cart.
// The jobs run in this page, so keep it open while one runs.
import { ext } from './lib/ext.js';
import { loadSales } from './lib/cardmarket.js';
import { planSales } from './lib/plan.js';
import { buildCart } from './lib/postnl.js';
import { labelHtml, printLabels, fitLabels, pages, paper, effective, sheetOf, isSheet, perSheet, pageCount, printSummary, mm, PAPERS } from './lib/labels.js';
import { defaultTemplate } from './lib/template.js';
import { saveRun, getRun, getSettings, DEFAULTS } from './lib/store.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eur = v => v == null ? '' : '€ ' + Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PX = 96 / 25.4;
const SAMPLE = { NAME: 'Jan Jansen', ADDRESS: ['Voorbeeldstraat 12 B'], POSTCODE: '1234AB', CITY: 'Voorbeeldstad', COUNTRY: 'Netherlands', ID: '1234567890' };

const state = { job: null, progress: null, list: null, only: null, loadedAt: null, login: false, plan: null, cart: null, printed: null, error: null, log: [] };
let settings = { ...DEFAULTS };
let data = null;   // methods, countries, rates, byName

const log = m => { state.log.push(`${new Date().toLocaleTimeString('nl-NL')}  ${m}`); if (state.log.length > 800) state.log.shift(); render(); };

async function loadData() {
  if (data) return data;
  const get = async n => (await fetch(ext.runtime.getURL(`data/${n}.json`))).json();
  const [methods, countries, rates] = await Promise.all([get('methods'), get('countries'), get('rates')]);
  data = { methods, countries, rates, byName: Object.fromEntries(Object.entries(countries).map(([iso, v]) => [v[0], iso])) };
  return data;
}

async function run(name, fn) {
  if (state.job) return;
  state.job = name; state.error = null; state.progress = null; render();
  try { await fn(); }
  catch (e) { state.error = e.message; log(`${name} FAILED: ${e.message}`); }
  finally { state.job = null; state.progress = null; state.login = false; render(); }
}

// the order numbers in the "Specific order numbers" field (10 digits each), or null when it is empty
const onlyIds = () => { const ids = [...new Set($('#only').value.match(/\b\d{10}\b/g) || [])]; return ids.length ? ids : null; };
async function load(list, only) {
  Object.assign(state, { plan: null, cart: null, printed: null, list: null, only: null, loadedAt: null });
  const cfg = await loadData();
  const me = await ext.tabs.getCurrent();
  const sales = await loadSales(list, {
    log, windowId: me.windowId, only, onProgress: (n, of) => { state.progress = [n, of]; renderProgress(); },
    onLogin: async on => { state.login = on; render(); if (!on) await ext.tabs.update(me.id, { active: true }); },
  });
  state.plan = planSales(sales, cfg);
  state.list = list; state.only = only; state.loadedAt = new Date();
  $('#pickcodes').checked = state.plan.stamps.length > 0;
  $('#picklabels').checked = state.plan.tracked.some(t => !t.error);
  await saveRun(list, state.plan, only);   // the panel in the Cardmarket page shows it too
  const p = state.plan;
  log(`Stamps: ${p.stampLine || '-'} | address labels: ${p.print.length} | tracked: ${p.tracked.length} | by hand: ${p.skipped.length}`);
}

// Only the selected cards go into the cart: Codes (stamp groups), Shipping labels (tracked sales).
async function cart(withCodes, withLabels) {
  const stamps = withCodes ? state.plan.stamps : [];
  const tracked = withLabels ? state.plan.tracked.filter(t => !t.error) : [];
  const me = await ext.tabs.getCurrent();
  state.cart = { running: true }; render();
  log(`PostNL: ${stamps.length} stamp code group(s) + ${tracked.length} shipping label(s), in parallel tabs...`);
  const t = Date.now();
  state.cart = await buildCart({ stamps, tracked, fallbackEmail: settings.fallbackEmail, windowId: me.windowId, log, onProgress: (n, of, it) => { state.progress = [n, of, it]; renderProgress(); } });
  state.cart.seconds = Math.round((Date.now() - t) / 100) / 10;
  log(`PostNL done in ${state.cart.seconds} s.${state.cart.merged ? ' The cart tab is in front: check it and pay there.' : ''}`);
}

// ---------------------------------------------------------------- render
let lastKey = '';
function renderLog() {
  const el = $('#log'), atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
  el.innerHTML = state.log.map(l => { const e = esc(l); return /FAILED|ERROR|CHECK THE CART/.test(l) ? `<span class="e">${e}</span>` : /in its cart|Cart:|done|Logged in/.test(l) ? `<span class="g">${e}</span>` : /manual address|suffix|guess|Not logged in|cookie/i.test(l) ? `<span class="y">${e}</span>` : e; }).join('\n') || 'Nothing yet.';
  if (atEnd) el.scrollTop = el.scrollHeight;
}
function addressText(t) {
  if (t.error) return '';
  if (t.Iso === 'NL') return `${esc(t.Street)} ${esc(t.Number)}${t.Suffix ? ` <span class="tag">${esc(t.Suffix)}</span>` : ''}<br>${esc(t.Postcode)} ${esc(t.Town)}`;
  const m = t.Manual;
  const man = m ? `<br><span class="hint">manual if needed: ${esc(m.Street)} · ${esc(m.Nr)}${m.Ext ? ' ' + esc(m.Ext) : ''}${Object.entries(m.Fields || {}).map(([f, v]) => ` · ${esc(f)}: ${esc(v)}`).join('')}</span>` : '';
  return `${esc(t.AddressLine)}<br>${esc(t.Postcode)} ${esc(t.Town)}${man}`;
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
  $('#prevsize').textContent = sheet ? `${mm(e.width)}×${mm(e.height)} mm, ${g.cols}×${g.rows} per sheet, ${pageCount(p.print, settings)} sheet(s)` : `${settings.width}×${settings.height} mm`;
  $('#startwrap').hidden = !sheet;
  if (sheet) { $('#start').max = perSheet(settings); $('#start').value = Math.min(Math.max(1, g.start || 1), perSheet(settings)); }
  $('#previews').classList.toggle('sheetview', sheet);
  $('#previews').classList.toggle('pick', sheet);
  $('#previews').innerHTML = sheet
    ? sheetFigures(p.print, settings, 340, (i, n) => `Sheet ${i + 1} of ${n}${i === 0 ? ': click a position to start there' : ''}`)
    : p.print.map(o => previewFigure(o.Fields, o.Id)).join('');
  if (!$('#previews').hidden) fitLabels($('#previews'));
}
// Sheet mode: the first free position on the first sheet (click a cell of sheet 1, or type it)
async function setStart(n) {
  const max = perSheet(settings), start = Math.min(Math.max(1, Math.round(+n) || 1), max);
  await saveSettings({ sheet: { ...sheetOf(settings), start } });
  lastKey = ''; render();
}
function renderPlan() {
  const p = state.plan;
  $('#result').hidden = !p || $('nav button.on').dataset.tab !== 'run';
  if (!p) return;
  const key = `${state.loadedAt}|${settings.width}|${settings.height}|${settings.html}|${JSON.stringify(settings.sheet || {})}`;
  if (key !== lastKey) {
    lastKey = key;
    $('#resulttitle').textContent = `Breakdown: ${state.only ? `${state.only.length} chosen order(s)` : 'paid orders'}, loaded ${state.loadedAt.toLocaleTimeString('nl-NL')}`;
    const nStamps = p.stamps.reduce((a, g) => a + g.qty, 0);
    $('#chips').innerHTML = [`${p.count} sale(s)`, `${p.print.length} address label(s)`, `${nStamps} stamp(s)`, `${p.tracked.length} tracked`, `${p.skipped.length} by hand`].map(c => `<span class="chip">${c}</span>`).join('');
    $('#stamps').innerHTML = p.stamps.length ? `<thead><tr><th>Code</th><th>Country</th><th class="num">Weight</th><th class="num">Qty</th><th>Sales</th></tr></thead><tbody>${p.stamps.map(g => `<tr><td class="mono">${g.code}</td><td>${esc(g.country)}</td><td class="num">${g.weight} g</td><td class="num">${g.qty}</td><td class="mono">${g.ids.join(', ')}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="hint">None.</td></tr></tbody>';
    $('#tracked').innerHTML = p.tracked.length ? `<thead><tr><th>Sale</th><th>To</th><th>PostNL</th><th>Recipient</th><th>Address to enter</th><th>Phone</th><th>E-mail</th><th>Notes</th></tr></thead><tbody>${p.tracked.map(t => `<tr>
      <td class="mono">${t.Id}<br><span class="hint">${eur(t.value)}</span></td><td>${esc(t.Iso)}</td>
      <td>${esc(t.Product)}<br>${esc(t.Option)}${t.Grams ? `<br><span class="hint">max. ${t.Grams} g</span>` : ''}${t.Seen === 'guess' ? ' <span class="tag bad">guess</span>' : ''}</td>
      <td>${t.error ? esc(t.address?.[0]) : `${esc(t.First)} ${esc(t.Last)}`}</td><td>${addressText(t)}</td>
      <td class="mono">${esc(t.Phone || '')}</td><td class="mono">${esc(t.Email || '')}</td>
      <td>${t.error ? `<span class="bad">${esc(t.error)}</span><br><span class="hint">${esc((t.address || []).join(' | '))}</span>` : ''}${(t.warnings || []).map(w => `<div class="warn">${esc(w)}</div>`).join('')}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="hint">None.</td></tr></tbody>';
    $('#skippedwrap').hidden = !p.skipped.length;
    $('#skipped').innerHTML = `<tbody>${p.skipped.map(x => `<tr><td class="mono">${x.id}</td><td>${esc(x.iso || '')}</td><td>${esc(x.method || '')}</td><td class="warn">${esc(x.reason)}</td><td class="hint">${esc((x.address || []).join(' | '))}</td></tr>`).join('')}</tbody>`;
    const nCodes = p.stamps.length, nLabels = p.tracked.filter(t => !t.error).length, nBad = p.tracked.length - nLabels;
    $('#codesinfo').textContent = nCodes ? `${nStamps} stamp(s) in ${nCodes} code(s): ${p.stampLine}` : 'none in this run';
    $('#labelsinfo').textContent = nLabels ? `${nLabels} tracked label(s)${nBad ? `, ${nBad} to do by hand` : ''}` : 'none in this run';
    renderPreviews();
  }
  const busy = !!state.job, paid = state.list === 'Paid';
  $('#print').disabled = busy || !paid || !p.print.length;
  $('#print').title = paid ? `Print dialog for ${printSummary(p.print, settings)}` : 'Only after a load of the Paid list';
  const nCodes = p.stamps.length, nLabels = p.tracked.filter(t => !t.error).length;
  $('#pickcodes').disabled = busy || !nCodes; if (!nCodes) $('#pickcodes').checked = false;
  $('#picklabels').disabled = busy || !nLabels; if (!nLabels) $('#picklabels').checked = false;
  $('#cart').disabled = busy || !($('#pickcodes').checked || $('#picklabels').checked);
  const c = state.cart;
  $('#cartresult').hidden = !c || c.running;
  if (c && !c.running) {
    $('#cartitems').innerHTML = `<thead><tr><th>Item</th><th>Result</th><th class="num">Price</th><th class="num">Time</th></tr></thead><tbody>${c.items.map(i => `<tr><td class="mono">${esc(i.key)}</td><td>${i.ok ? `<span class="ok">in the cart</span>${i.manual ? ' <span class="tag warn">manual address</span>' : ''}` : `<span class="bad">${esc(i.error)}</span>`}</td><td class="num">${eur(i.total)}</td><td class="num">${i.ms != null ? (i.ms / 1000).toFixed(1) + ' s' : ''}</td></tr>`).join('')}</tbody>`;
    $('#cartsummary').innerHTML = c.merged ? `${c.count} item(s) in one cart, total <b>${eur(c.total)}</b>${c.check ? '' : ` <span class="bad">expected ${eur(c.expected)}: check the cart</span>`}, in ${c.seconds} s. The cart tab is in front: check it and pay there.`
      : 'Nothing was added. Failed items keep their tab open.';
  }
}
// Progress bars while a job runs, as in the Cardmarket panel: loading under the load button (per sale), the
// PostNL cart under the cart row (per step; the text counts the finished items).
function renderProgress() {
  const el = state.job === 'Adding to PostNL cart' ? $('#cartprogress') : /^Loading/.test(state.job || '') ? $('#loadprogress') : null;
  for (const p of [$('#loadprogress'), $('#cartprogress')]) p.hidden = p !== el;
  if (!el) return;
  const [n, of, it] = state.progress || [0, 0];
  el.querySelector('.progresstext').textContent = `${state.job}…${it ? ` ${it.items}/${it.of}` : of ? ` ${n}/${of}` : ''}`;
  el.querySelector('.pbar i').style.width = `${of ? Math.round(100 * n / of) : 0}%`;
}
function render() {
  $('#dot').className = state.job ? 'run' : state.error ? 'bad' : state.plan ? 'ok' : '';
  $('#statustext').textContent = state.job ? `running: ${state.job}` : state.error ? `failed: ${state.error}` : state.plan ? 'ready' : 'idle';
  $('#load').disabled = !!state.job || !$('#access').hidden;
  $('#login').hidden = !state.login;
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
  if (!f.sheet.on) return f.width >= 15 && f.width <= 300 && f.height >= 15 && f.height <= 300 ? null : 'Label width and height: 15-300 mm.';
  const g = f.sheet;
  if (!(g.paperW >= 50 && g.paperW <= 1000 && g.paperH >= 50 && g.paperH <= 1000)) return 'Paper width and height: 50-1000 mm.';
  if (!(g.cols >= 1 && g.cols <= 12 && g.rows >= 1 && g.rows <= 30)) return 'Columns: 1-12, rows: 1-30.';
  if (g.paperW / g.cols < 10 || g.paperH / g.rows < 10) return 'A label must be at least 10 × 10 mm: use fewer columns or rows.';
  return null;
}
const OWN = 'Your own layout: it does not follow the label size.', DEF = 'Default layout: it follows the label size.';
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
  $('#sheetinfo').textContent = bad || `Label size: ${mm(e.width)} × ${mm(e.height)} mm, ${f.sheet.cols * f.sheet.rows} labels per sheet.`;
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
const paperName = g => Object.keys(PAPERS).find(k => PAPERS[k][0] === +g.paperW && PAPERS[k][1] === +g.paperH) || 'custom';
function fillSettingsForm() {
  const g = sheetOf(settings);
  $('#lw').value = settings.width; $('#lh').value = settings.height; $('#rotate').value = String(settings.rotate || 0); $('#femail').value = settings.fallbackEmail;
  for (const r of document.querySelectorAll('input[name=papermode]')) r.checked = r.value === (g.on ? 'sheet' : 'printer');
  $('#paper').value = paperName(g); $('#pw').value = g.paperW; $('#ph').value = g.paperH; $('#cols').value = g.cols; $('#rows').value = g.rows;
  $('#html').value = settings.html || defaultFor(settings);
  $('#htmlinfo').textContent = settings.html ? OWN : DEF;
  htmlPreview();
}
async function loadSettings() {
  settings = await getSettings();   // also migrates the old ZPL / return-address settings once
  fillSettingsForm();
}
async function saveSettings(patch) { settings = { ...settings, ...patch }; await ext.storage.local.set({ settings }); }
// a size change: a default layout follows the (cell) size while you type
function sizeChanged() {
  const f = formSize();
  if ($('#htmlinfo').textContent === DEF && !sizeProblem(f)) $('#html').value = defaultFor(f);
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
$('#html').addEventListener('input', () => { $('#htmlinfo').textContent = OWN; htmlPreview(); });
$('#htmldefault').onclick = () => {
  const f = formSize();
  $('#html').value = sizeProblem(f) ? defaultTemplate(70, 40) : defaultFor(f);
  $('#htmlinfo').textContent = DEF;
  htmlPreview();
};
$('#savesettings').onclick = async () => {
  const f = formSize(), femail = $('#femail').value.trim(), html = $('#html').value.trim();
  const bad = sizeProblem(f);
  if (bad) { $('#settingsmsg').textContent = bad; return; }
  if (femail && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(femail)) { $('#settingsmsg').textContent = 'That is not an e-mail address.'; return; }
  if (!html) { $('#settingsmsg').textContent = 'The layout is empty: click "Default layout for this size".'; return; }
  // the default layout is stored as '' so that it keeps following the label size
  const isDefault = html === defaultFor(f).trim();
  // a new grid: start again at position 1
  const old = sheetOf(settings);
  if (f.sheet.cols !== old.cols || f.sheet.rows !== old.rows) f.sheet.start = 1;
  await saveSettings({ ...f, fallbackEmail: femail, html: isDefault ? '' : html });
  const e = effective(f);
  const where = f.sheet.on ? `${f.sheet.cols}×${f.sheet.rows} labels of ${mm(e.width)}×${mm(e.height)} mm on ${mm(f.sheet.paperW)}×${mm(f.sheet.paperH)} mm paper`
    : `${f.width}×${f.height} mm${f.rotate ? `, turned ${f.rotate}° on a ${f.rotate % 180 ? `${f.height}×${f.width}` : `${f.width}×${f.height}`} mm page` : ''}`;
  $('#settingsmsg').textContent = `Saved: ${where}, ${isDefault ? 'default' : 'own'} layout.`;
  fillSettingsForm();
  lastKey = '';
  render();
};

// ---------------------------------------------------------------- methods
async function loadMethods() {
  const d = await loadData();
  if (!$('#country').options.length) {
    const have = new Set(d.rates.map(r => r.Iso));
    $('#country').innerHTML = Object.entries(d.countries).filter(([iso]) => have.has(iso)).sort().map(([iso, v]) => `<option value="${iso}">${esc(v[0])} (${iso})</option>`).join('');
    $('#country').value = 'DE';
    $('#country').onchange = drawMethods;
  }
  drawMethods();
}
function drawMethods() {
  const iso = $('#country').value, rates = data.rates.filter(r => r.Iso === iso);
  $('#mtable').innerHTML = `<thead><tr><th>Cardmarket method</th><th>Service</th><th>PostNL product · option</th><th>Seen</th><th class="num">Max. value</th><th class="num">Max. weight</th><th class="num">CM price</th><th class="num">Days</th></tr></thead><tbody>${[...new Set(rates.map(r => r.Method))].map(name => {
    const m = data.methods[name] || { Service: '?' }, rs = rates.filter(r => r.Method === name);
    return `<tr><td>${esc(name)}</td><td><span class="tag">${esc(m.Service)}</span></td><td>${m.Service === 'postnl' ? `${esc(m.Product)} · ${esc(m.Option)}` : ''}</td><td>${m.Seen ? `<span class="tag ${m.Seen === 'guess' ? 'bad' : ''}">${m.Seen}</span>` : ''}</td>
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
$('#load').onclick = () => { const only = onlyIds(); run(only ? `Loading ${only.length} order(s)` : 'Loading paid orders', () => load('Paid', only)); };
const onlyInfo = () => {
  const only = onlyIds(), extra = ($('#only').value.match(/\d+/g) || []).filter(n => n.length !== 10);
  $('#onlyinfo').textContent = (only ? `Only: ${only.join(', ')}` : '') + (extra.length ? `${only ? '. ' : ''}Not 10 digits, skipped: ${extra.join(', ')}` : '');
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
  run('print dialog', async () => {
    log(`Print dialog for ${printSummary(state.plan.print, settings)}.`);
    await printLabels(state.plan.print, settings);
    state.printed = new Date();
    log('Print dialog closed.');
  });
};
$('#start').addEventListener('change', () => setStart($('#start').value));
$('#previews').addEventListener('click', e => {
  const cell = e.target.closest('.cml-cell');
  if (!cell || !isSheet(settings) || state.job || cell.closest('.cml-page') !== $('#previews .cml-page')) return;
  setStart(cell.dataset.cell);
});
for (const id of ['#pickcodes', '#picklabels']) $(id).onchange = () => render();
$('#cart').onclick = () => {
  const withCodes = $('#pickcodes').checked, withLabels = $('#picklabels').checked;
  if (!withCodes && !withLabels) return;
  run('Adding to PostNL cart', () => cart(withCodes, withLabels));
};
window.addEventListener('beforeunload', e => { if (state.job) { e.preventDefault(); e.returnValue = ''; } });

// Firefox (Manifest V3) treats host permissions as optional: ask for them, from a click, when they are missing.
// Chromium grants them at install, so this stays hidden there.
const ORIGINS = ['https://www.cardmarket.com/*', 'https://jouw.postnl.nl/*'];
async function checkAccess() {
  const ok = await ext.permissions.contains({ origins: ORIGINS }).catch(() => true);
  $('#access').hidden = ok;
  render();
  return ok;
}
$('#grant').onclick = async () => { try { await ext.permissions.request({ origins: ORIGINS }); } catch (e) { log(`Permission request failed: ${e.message}`); } await checkAccess(); };

await loadSettings();
// the last load (also one made in the Cardmarket page panel), if it is recent
const last = await getRun();
if (last) {
  Object.assign(state, { plan: last.plan, list: last.list, only: last.only || null, loadedAt: last.loadedAt });
  $('#pickcodes').checked = last.plan.stamps.length > 0;
  $('#picklabels').checked = last.plan.tracked.some(t => !t.error);
}
render();
await checkAccess();
