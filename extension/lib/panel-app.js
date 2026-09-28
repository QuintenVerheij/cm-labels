// The cm-labels panel in the Cardmarket page (content script, loaded by content/panel.js).
// Paid list: a "cm-labels" button in the title row (right, above the line) opens a panel fixed at the top right,
//            over the page: Load -> short breakdown -> Print labels / Add to PostNL cart. The full tables and
//            previews are on the full page ("Open full page" at the top of the panel).
// Sale page: an "Add to PostNL cart" button at the same place puts this one sale in the PostNL cart.
// The run lives in this page: keep it open while a run goes. Tab work goes through the background script.
import { ext, openPage } from './ext.js';
import { loadSales, baseFromPath, isReadablePath } from './cardmarket.js';
import { planSales } from './plan.js';
import { buildCart } from './postnl.js';
import { getSettings, saveRun, getRun, clearRun, runAge, runScope, loadData } from './store.js';
import { esc } from './esc.js';

const AGAIN_PROMPT = 'A cart was already built from this load and its tab may still be open. Building another one and paying both pays the postage twice. Build another cart?';
const eur = v => v == null ? '' : '€ ' + Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = d => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: "Segoe UI", system-ui, sans-serif; }
.btn { font: 600 12px/1 "Segoe UI", system-ui, sans-serif; letter-spacing: .03em; text-transform: uppercase; border-radius: 4px; padding: 8px 12px; cursor: pointer;
  border: 1px solid var(--cmline, #eef0f3); background: var(--cmbg, #eef0f3); color: var(--cmfg, #0e2a66); display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.btn.quiet { background: transparent; color: var(--ink); border-color: var(--line); }
.btn:disabled { opacity: .45; cursor: default; }
.panel { position: fixed; top: 96px; right: 16px; width: 360px; max-height: calc(100vh - 112px); overflow: auto; z-index: 2147483000;
  background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 32px #0008; font-size: 13px; line-height: 1.4; }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--bg); }
.head b { font-size: 14px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.dot.run { background: #e6b450; animation: p 1s infinite; } .dot.ok { background: #5cc98a; } .dot.bad { background: #ff7b72; }
@keyframes p { 50% { opacity: .3; } }
.head .sp { flex: 1; }
.x { background: none; border: 0; color: var(--muted); font-size: 18px; cursor: pointer; padding: 0 2px; line-height: 1; }
.icon { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 3px; border-radius: 4px; display: inline-flex; }
.icon:hover, .x:hover { color: var(--ink); background: var(--line); }
.icon:focus-visible, .x:focus-visible { outline: 2px solid var(--cmfg, #5b9bff); outline-offset: 1px; }
.body { padding: 12px; display: grid; gap: 10px; }
.muted { color: var(--muted); font-size: 12px; }
.sum { font-weight: 600; }
.issues { margin: 0; padding: 0 0 0 16px; color: #e6b450; font-size: 12px; }
.issues li { margin: 2px 0; }
.issues a { color: inherit; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.card { position: relative; cursor: pointer; }
.card input { position: absolute; opacity: 0; }
.card span { display: grid; gap: 2px; padding: 8px 10px 8px 30px; border: 2px solid var(--line); border-radius: 8px; height: 100%; position: relative; }
.card span::before { content: ''; position: absolute; left: 9px; top: 10px; width: 13px; height: 13px; border: 2px solid var(--muted); border-radius: 3px; }
.card input:checked + span { border-color: #5b9bff; }
.card input:checked + span::before { background: #5b9bff; border-color: #5b9bff; box-shadow: inset 0 0 0 2px var(--bg); }
.card input:disabled + span { opacity: .45; }
.card b { font-size: 13px; } .card small { color: var(--muted); font-size: 11px; }
.actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.bar { height: 4px; background: var(--line); border-radius: 2px; overflow: hidden; }
.bar i { display: block; height: 100%; background: #5b9bff; transition: width .3s; }
.log { font: 11px/1.4 Consolas, monospace; color: var(--muted); white-space: pre-wrap; word-break: break-word; }
.err { color: #ff7b72; }
.ok { color: #5cc98a; }
`;

export async function start({ saleId, list }) {
  const readable = isReadablePath(location.pathname);
  const state = { job: null, plan: null, list: null, loadedAt: null, cart: null, error: null, progress: null, lines: [] };
  // progress comes from the onProgress callbacks of loadSales (every sale) and buildCart (every step of every
  // cart item: the bar moves per step, the text counts the finished items)
  const log = m => { state.lines.push(m); if (state.lines.length > 60) state.lines.shift(); render(); };

  // ------------------------------------------------ the button in the title row (right, above the line)
  // It copies Cardmarket's own button: the classes of "Search in my shipments" (Paid page) or "Confirm shipment"
  // (sale page), so Cardmarket's CSS gives it exactly the same look. It is in the normal page (no shadow root)
  // for that reason. Without such a button: the same colours, set here.
  // Cardmarket's button: the deepest element whose text contains the label (any element type, any case), then
  // up to its clickable element (a, button, role=button, .btn). The visible one wins: there can be a hidden copy.
  const REF = /search in my shipments|confirm shipment/i;
  const norm = e => e.textContent.replace(/\s+/g, ' ').trim();
  const leaves = [...document.querySelectorAll('main *')].filter(e => REF.test(norm(e)) && ![...e.children].some(c => REF.test(norm(c))));
  const refs = [...new Set(leaves.map(e => e.closest('a, button, [role=button], .btn, label') || e))];
  const ref = refs.find(e => e.getClientRects().length) || refs[0];
  const h1 = document.querySelector('h1');
  const anchor = document.createElement('div');
  const labelText = saleId ? 'Add to PostNL cart' : 'cm-labels';
  const ICON = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" style="vertical-align:-0.125em"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7.2l6.3 6.3v7.2A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"/></svg>';
  const PRINT_ICON = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" style="vertical-align:-0.125em"><path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2"/><path d="M7 14h10v6H7z"/></svg>';
  // One builder for every button, so they all get the same design.
  const mk = (labelText, ICON) => {
  let btn;
  if (ref) {
    // A clone of Cardmarket's own button: same elements and classes, so its CSS gives the same font, weight,
    // height and colours. Links, ids and data attributes go; only the icon and the text change.
    btn = ref.cloneNode(true);
    // The clone stands in another container (the title row: larger font, other CSS context), so copy the computed
    // style of every original element onto the matching clone element: the size no longer follows the container.
    const PROPS = ['display', 'boxSizing', 'height', 'minHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'borderColor', 'borderRadius', 'backgroundColor', 'color',
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textTransform', 'whiteSpace', 'verticalAlign', 'alignItems', 'gap'];
    const orig = [ref, ...ref.querySelectorAll('*')], copy = [btn, ...btn.querySelectorAll('*')];
    // 'display' only for the button itself: inner elements keep their classes, which switch the text per width
    orig.forEach((o, i) => { const cs = getComputedStyle(o), c = copy[i]; if (c) for (const k of PROPS) if (i === 0 || k !== 'display') c.style[k] = cs[k]; });
    btn.style.width = 'auto'; btn.style.flex = 'none';
    for (const el of [btn, ...btn.querySelectorAll('*')])
      for (const at of [...el.attributes]) if (/^(id|href|name|for|type|onclick|data-|aria-controls|aria-expanded|formaction|target)/i.test(at.name)) el.removeAttribute(at.name);
    const glyph = btn.querySelector('[class*="fonticon"], i, svg');
    if (glyph) { const icon = document.createElement('span'); icon.className = String(glyph.getAttribute('class') || '').replace(/\bfonticon-\S+/g, '').trim(); icon.style.cssText = glyph.style.cssText; icon.innerHTML = ICON; glyph.replaceWith(icon); }   // keeps the copied size of the magnifier
    // Every text of the clone gets our label: Cardmarket has one text per screen width ("Search in my Shipments"
    // from sm, "Search" below), and the classes show the right one.
    const texts = []; const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) if (n.nodeValue.trim()) texts.push(n);
    for (const n of texts) n.nodeValue = n.nodeValue.replace(/\S.*\S|\S/s, labelText);
    if (!texts.length) btn.append(labelText);
    btn.setAttribute('role', 'button'); btn.tabIndex = 0; btn.style.cursor = 'pointer';
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); } });
  } else {
    btn = document.createElement('button');   // no Cardmarket button to copy: the same colours, set here
    btn.type = 'button';
    btn.style.cssText = 'background:#eef0f3;color:#0e2a66;border:1px solid #eef0f3;border-radius:4px;padding:5px 9px;font-family:inherit;font-size:12px;font-weight:700;line-height:1.2;text-transform:uppercase;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;gap:6px';
    btn.innerHTML = `${ICON}<span>${labelText}</span>`;
  }
  return btn;
  };
  const btn = mk(labelText, ICON);
  const printBtn = saleId ? mk('Print label', PRINT_ICON) : null;   // sale page: left of the cart button
  if (printBtn) anchor.append(printBtn);
  anchor.append(btn);
  if (h1?.parentElement) {
    const parent = h1.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    // at the bottom of the title row, just above the line (small gap), not centred in the taller row
    anchor.style.cssText = 'position:absolute;display:flex;gap:8px;align-items:flex-end;padding-bottom:6px;box-sizing:border-box;z-index:5';
    // right edge = the content edge of the title container, where the line and the other button end
    const place = () => { const cs = getComputedStyle(parent); anchor.style.right = cs.paddingRight; anchor.style.top = `${h1.offsetTop}px`; anchor.style.height = `${h1.offsetHeight}px`; };
    parent.append(anchor);
    place();
    new ResizeObserver(place).observe(parent);
  } else {
    anchor.style.cssText = 'position:fixed;display:flex;gap:8px;right:16px;bottom:16px;z-index:2147483000';   // Cardmarket changed its page: fall back
    document.body.append(anchor);
  }
  // colours for the panel buttons: the same as that Cardmarket button
  const rs = getComputedStyle(ref || btn);
  const btnVars = `--cmbg:${rs.backgroundColor};--cmfg:${rs.color};--cmline:${rs.borderColor}`;

  // ------------------------------------------------ the panel, fixed top right over the page
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  // follow Cardmarket's light or dark look
  const bg = getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number) || [255, 255, 255];
  const dark = (bg[0] * 299 + bg[1] * 587 + bg[2] * 114) / 1000 < 128;
  const vars = dark ? '--bg:#1b1d21;--ink:#e6e7ea;--muted:#9aa0a8;--line:#353942' : '--bg:#ffffff;--ink:#1d1f23;--muted:#6b7078;--line:#dfe1e4';
  root.innerHTML = `<style>${CSS} .panel{${vars};${btnVars}} .btn.quiet{--ink:${dark ? '#e6e7ea' : '#1d1f23'}}</style><div class="panel" hidden>
    <div class="head"><span class="dot"></span><b>cm-labels</b><span class="sp"></span><button class="icon" id="full" title="Open full page" aria-label="Open full page"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M11 5H7.5A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5V13" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 13.5l6.4-6.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 3h7v7z" fill="currentColor"/></svg></button><button class="icon" id="close" title="Close" aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="body" id="body"></div></div>`;
  const panel = root.querySelector('.panel'), $ = s => root.querySelector(s);
  $('#close').onclick = () => { panel.hidden = true; };
  $('#full').onclick = () => openPage('app.html');
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden && !state.job) panel.hidden = true; });
  addEventListener('beforeunload', e => { if (state.job) { e.preventDefault(); e.returnValue = ''; } });

  const run = async (name, fn) => {
    if (state.job) return;
    state.job = name; state.error = null; state.progress = null; render();
    try { await fn(); } catch (e) { state.error = e.message; } finally { state.job = null; render(); }
  };
  const nLabels = p => p.tracked.filter(t => !t.error).length;
  const issues = p => [
    ...p.skipped.map(x => ({ id: x.id, text: x.reason })),
    ...p.tracked.filter(t => t.error).map(t => ({ id: t.Id, text: t.error })),
    ...p.tracked.filter(t => !t.error && t.warnings?.some(w => /guess|no street/.test(w))).map(t => ({ id: t.Id, text: t.warnings.join('; ') })),
  ];

  async function load() {
    state.plan = null; state.only = null;
    await clearRun();   // a failed load leaves no earlier run behind
    const cfg = await loadData('NL');
    const me = await ext.tabs.getCurrent();
    const sales = await loadSales(list, { log, windowId: me.windowId, onProgress: (n, of) => { state.progress = [n, of]; render(); } });
    state.plan = planSales(sales, cfg); state.list = list; state.loadedAt = new Date(); state.cart = null;
    state.pick = { codes: state.plan.stamps.length > 0, labels: nLabels(state.plan) > 0 };
    await saveRun(list, state.plan);
  }
  async function cart(stamps, tracked) {
    const me = await ext.tabs.getCurrent();
    state.cart = null;
    const { fallbackEmail } = await getSettings();
    state.cart = await buildCart({ stamps, tracked, fallbackEmail, windowId: me.windowId, log, onProgress: (n, of, it) => { state.progress = [n, of, it]; render(); } });
  }
  async function print() {
    if (state.list !== 'Paid') return;   // printing only after a Paid load
    const s = await getSettings();
    await ext.storage.local.set({ printJob: { orders: state.plan.print, settings: s, at: Date.now() } });
    await openPage('print.html', { reuse: false });
  }
  // Single sale page: read this page, plan it, put it in the cart.
  async function addThisSale() {
    const cfg = await loadData('NL');
    const sale = globalThis.__cmlCM?.sale(saleId);
    if (!sale || sale.error) throw new Error(sale?.error || 'could not read this sale page');
    const p = planSales([sale], cfg);
    state.plan = p; state.list = 'sale';
    const what = p.stamps.length ? `stamp code ${p.stamps[0].code} ×1` : nLabels(p) ? `shipping label: ${p.tracked[0].Product} · ${p.tracked[0].Option}` : null;
    if (!what) throw new Error(issues(p)[0]?.text || 'nothing for PostNL in this sale');
    log(`Sale ${saleId}: ${what}`);
    await cart(p.stamps, p.tracked.filter(t => !t.error));
  }

  // Single sale page: read this page, plan it, open the print dialog for its address label.
  async function printThisSale() {
    const cfg = await loadData('NL');
    const sale = globalThis.__cmlCM?.sale(saleId);
    if (!sale || sale.error) throw new Error(sale?.error || 'could not read this sale page');
    const p = planSales([sale], cfg);
    if (!p.print.length) throw new Error(issues(p)[0]?.text || 'no label for this sale');
    const s = await getSettings();
    await ext.storage.local.set({ printJob: { orders: p.print, settings: s, at: Date.now() } });
    await openPage('print.html', { reuse: false });
  }

  function cartLine() {
    const c = state.cart;
    if (!c) return '';
    const bad = c.items.filter(i => !i.ok);
    return `<div>${c.merged ? `<span class="ok">${c.count} item(s) in the PostNL cart, ${eur(c.total)}${c.check ? '' : ` <span class="err">(expected ${eur(c.expected)}: check the cart)</span>`}.</span> The cart tab is in front: pay there.` : '<span class="err">Nothing was added.</span>'}</div>
      ${bad.map(i => `<div class="err">${esc(i.key)}: ${esc(i.error)}</div>`).join('')}`;
  }
  function render() {
    $('.dot').className = `dot ${state.job ? 'run' : state.error ? 'bad' : state.plan ? 'ok' : ''}`;
    for (const b of [btn, printBtn]) if (b) { b.setAttribute('aria-disabled', String(!!state.job)); b.style.pointerEvents = state.job ? 'none' : ''; b.style.opacity = state.job ? '.6' : ''; }
    const p = state.plan, last = state.lines[state.lines.length - 1];
    let html = '';
    if (!readable) {
      html = '<div>cm-labels works only on the English Magic pages (cardmarket.com/en/Magic).</div>';
    } else if (state.job) {
      const [n, of, it] = state.progress || [0, 0];
      html = `<div class="sum">${esc(state.job)}…${it ? ` ${it.items}/${it.of}` : of ? ` ${n}/${of}` : ''}</div>${of ? `<div class="bar"><i style="width:${Math.round(100 * n / of)}%"></i></div>` : '<div class="bar"><i style="width:0%"></i></div>'}
        <div class="log">${esc(last || '')}</div><div class="muted">Keep this page open until the run is done.</div>`;
    } else if (saleId) {
      html = `${state.error ? `<div class="err">${esc(state.error)}</div>` : ''}${cartLine()}${!state.error && !state.cart ? '<div class="muted">Puts this sale in the PostNL cart (stamp code or shipping label). Nothing is paid.</div>' : ''}
        <div class="actions"><button class="btn" id="again">${state.cart || state.error ? 'Try again' : 'Add to PostNL cart'}</button></div>`;
    } else if (!p) {
      const rows = document.querySelectorAll('div[data-url*="/Orders/"]').length;
      const pages = +((document.body.textContent.match(/Page \d+ of (\d+)/) || [])[1] || 1);
      html = `${state.error ? `<div class="err">${esc(state.error)}</div>` : ''}<div>${rows} paid sale(s) on this page${pages > 1 ? `, ${pages} pages` : ''}.</div>
        <div class="actions"><button class="btn" id="load">Load paid sales</button></div>`;
    } else {
      const nStamps = p.stamps.reduce((a, g) => a + g.qty, 0), is = issues(p);
      html = `<div class="sum">${p.print.length} label(s) · ${nStamps} stamp(s) in ${p.stamps.length} code(s) · ${nLabels(p)} tracked${p.skipped.length ? ` · ${p.skipped.length} by hand` : ''}</div>
        <div class="muted">${state.only ? `${runScope(state.only)}, loaded` : 'Loaded'} ${state.loadedAt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} ${time(state.loadedAt)} (${runAge(state.loadedAt)}). <a href="#" id="reload" style="color:inherit">Load again</a></div>
        ${is.length ? `<ul class="issues">${is.slice(0, 5).map(x => `<li><a href="${esc(baseFromPath(location.pathname))}/Orders/${esc(x.id)}">${esc(x.id)}</a>: ${esc(x.text)}</li>`).join('')}${is.length > 5 ? `<li>${is.length - 5} more on the full page</li>` : ''}</ul>` : ''}
        ${state.error ? `<div class="err">${esc(state.error)}</div>` : ''}
        <div class="cards">
          <label class="card"><input type="checkbox" id="codes" ${state.pick?.codes ? 'checked' : ''} ${p.stamps.length ? '' : 'disabled'}><span><b>Codes</b><small>${p.stamps.length ? `${nStamps} stamp(s), ${p.stamps.length} code(s)` : 'none'}</small></span></label>
          <label class="card"><input type="checkbox" id="labels" ${state.pick?.labels ? 'checked' : ''} ${nLabels(p) ? '' : 'disabled'}><span><b>Shipping labels</b><small>${nLabels(p) ? `${nLabels(p)} tracked` : 'none'}</small></span></label>
        </div>
        <div class="actions"><button class="btn quiet" id="print" ${p.print.length && state.list === 'Paid' ? '' : 'disabled'} title="${state.list === 'Paid' ? 'Opens the print dialog' : 'Only after a load of the Paid list'}">Print labels (${p.print.length})</button><button class="btn" id="cart" ${state.list === 'Paid' && (state.pick?.codes || state.pick?.labels) ? '' : 'disabled'} title="${state.list === 'Paid' ? '' : 'Only after a load of the Paid list'}">Add to PostNL cart</button></div>
        ${cartLine()}`;
    }
    $('#body').innerHTML = html + (state.job || !last ? '' : `<div class="log">${esc(last)}</div>`);
    $('#load')?.addEventListener('click', () => run('Loading paid sales', load));
    $('#reload')?.addEventListener('click', e => { e.preventDefault(); run('Loading paid sales', load); });
    $('#again')?.addEventListener('click', () => {
      if ((state.cart?.merged || state.cart?.error) && !confirm(AGAIN_PROMPT)) return;
      run('Adding this sale', addThisSale);
    });
    for (const k of ['codes', 'labels']) $(`#${k}`)?.addEventListener('change', e => { state.pick = { ...state.pick, [k]: e.target.checked }; render(); });
    $('#print')?.addEventListener('click', () => run('Opening the print dialog', print));
    $('#cart')?.addEventListener('click', () => {
      if (state.list !== 'Paid') return;
      if ((state.cart?.merged || state.cart?.error) && !confirm(AGAIN_PROMPT)) return;
      const stamps = state.pick?.codes ? p.stamps : [], tracked = state.pick?.labels ? p.tracked.filter(t => !t.error) : [];
      run('Adding to the PostNL cart', () => cart(stamps, tracked));
    });
  }

  btn.onclick = () => {
    panel.hidden = false;
    if (!readable) render();
    else if (saleId && !state.job && !state.cart) run('Adding this sale', addThisSale);
    else render();
  };
  if (printBtn) printBtn.onclick = () => { if (!readable) { panel.hidden = false; render(); } else if (!state.job) { panel.hidden = false; run('Opening the print dialog', printThisSale); } };
  // Paid page: show the last Paid load (same as the full page), if it is recent.
  if (list && readable) {
    const last = await getRun();
    if (last?.list === list) { state.plan = last.plan; state.list = list; state.loadedAt = last.loadedAt; state.only = last.only || null; state.pick = { codes: last.plan.stamps.length > 0, labels: nLabels(last.plan) > 0 }; }
  }
  render();
}
