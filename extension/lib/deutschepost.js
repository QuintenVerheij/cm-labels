// Deutsche Post: stamps (Internetmarke) from shop.deutschepost.de. The shop keeps one cart per session (its id in
// the tab's sessionStorage), so every product goes into the same cart one after the other, in one tab. That tab
// comes to the front on the cart page (/checkout) at the end: check it and pay there. Nothing here pays.
// Tracked labels (Einschreiben) are not in this cart; they stay manual.
import { ext } from './ext.js';
import { Tab, sleep } from './tabs.js';

export const NAME = 'Deutsche Post';
export const ORIGINS = ['https://shop.deutschepost.de/*'];
export const BRACKETS = [20, 50, 500, 1000];   // Standardbrief, Kompaktbrief, Großbrief, Maxibrief (SHOP.letters)
export const CONC = 1;   // one cart per session: parallel tabs would race on it

// THE SHOP'S PAGES: every address, selector and text this module relies on. A shop change is a fix here.
// Read on 2026-09-29 from the shop's public pages, its deep links and its page scripts (the "oneof" product
// widget and the checkout widget). UNVERIFIED against the live shop with a cart being filled: a manual run in
// Firefox and in Chrome has to confirm each row. Specs: sel = CSS selector; text = exact text or aria-label;
// label = the start of the field's label; input = the element, or the one input inside it; what = its name in
// an error. Every action needs exactly one match (content/dp.js).
export const SHOP = {
  // Product editor, opened with the shop's own deep link parameters (as /shop/deeplink/internetmarke redirects).
  editor: 'https://shop.deutschepost.de/digital-frankieren',
  // Cart page; the payment steps come after it on the same path. content/dp.js refuses every click there.
  cart: 'https://shop.deutschepost.de/checkout',
  cartPath: '/checkout',
  login: /login/i,   // a path that asks for a login
  productList: { sel: '[role=grid][aria-label="Produktauswahl"]', what: 'product list (Produktauswahl)' },
  selected: { sel: '[role=grid][aria-label="Produktauswahl"] [role=row][aria-selected=true]', what: 'selected product' },
  destination: { sel: 'input', label: 'Zielland / Zielregion', what: 'Zielland / Zielregion field' },
  domestic: 'Deutschland',   // the destination's name for DEU
  count: { sel: '[aria-label="Bitte wählen Sie die Anzahl der Marken aus"]', input: true, what: 'Anzahl field' },
  addToCart: { sel: 'button', text: 'In den Warenkorb', what: 'In den Warenkorb button' },
  emptyCart: { sel: '[data-testid="empty-cart"]', what: 'empty cart' },
  lineDelete: { sel: 'button[aria-label="Position löschen"]', what: 'cart line (Position löschen)' },
  cookieRefuse: { sel: '#onetrust-reject-all-handler', what: 'cookie banner button Alle ablehnen' },
  waitMs: 30000,
  // Stamp bracket (g) -> product id and the names the selected product may have. country: the deep link's
  // receiverCountry; QMZ is the shop's code for "international" (its deep link for the international
  // Standardbrief uses it). Abroad Cardmarket has only the 20 g letter, 'Letter (Standardbrief)'.
  letters: {
    DE: { country: 'DEU', 20: { id: 'BRF0020', names: ['Standardbrief'] }, 50: { id: 'BRF0050', names: ['Kompaktbrief'] }, 500: { id: 'BRF0500', names: ['Großbrief'] }, 1000: { id: 'BRF1000', names: ['Maxibrief'] } },
    abroad: { country: 'QMZ', 20: { id: 'BRF0020', names: ['Standardbrief International', 'Standardbrief'] } },
  },
};

// Euro amounts in a text, in order: '0,95 €', '1.234,50 €' or '€ 0,95'.
const euros = s => [...String(s).matchAll(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*€|€\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/g)]
  .map(m => +((m[1] ?? m[3]).replace(/\./g, '') + '.' + (m[2] ?? m[4])));
const cents = x => Math.round(x * 100) / 100;
const editorUrl = p => `${SHOP.editor}?productId=${p.id}&receiverCountry=${p.country}&productCategory=BRIEF`;

// The product for a stamp group (DE-20 -> Standardbrief), or a readable error.
export function productFor(g) {
  const home = g.iso === 'DE', set = SHOP.letters[home ? 'DE' : 'abroad'], p = set[g.weight];
  if (!p) throw new Error(`Deutsche Post has no ${g.weight} g letter ${home ? 'in Germany' : 'abroad'} in cm-labels; buy it by hand`);
  return { ...p, country: set.country };
}
// A cart line's quantity from its title ("3 x Standardbrief"; one stamp has no count).
const lineQty = t => +(String(t).match(/^(\d+)\s*x\s/)?.[1] ?? 1);

// A wait for a page state; on timeout the message names the page the tab is on (a changed or unknown page).
async function wait(tab, cond, what) {
  try { await tab.waitFor(cond, SHOP.waitMs, what); } catch (e) {
    const p = await tab.safe('q', null, 'page');
    if (p && SHOP.login.test(p.path)) throw new Error(`Deutsche Post asks for a login (${p.path}): log in on shop.deutschepost.de in this browser, then build the cart again`);
    throw new Error(`Deutsche Post page unknown or changed: ${e.message}${p ? ` (the tab is on ${p.path}, '${p.title}')` : ''}`);
  }
}
async function fill(tab, spec, text) {
  let v = null;
  for (let i = 0; i < 3; i++) {
    v = await tab.call('fill', spec, text);
    await sleep(400);   // a number field can take the text back
    if (v != null) v = await tab.call('q', 'value', spec);
    if (v === text) return;
  }
  throw new Error(v == null ? `${spec.what} not found` : `${spec.what} holds '${v}', expected '${text}'`);
}
async function cookieBanner(tab, log) {
  const b = await tab.safe('cookie', false, SHOP.cookieRefuse);
  if (b) log?.('Deutsche Post cookie banner answered: Alle ablehnen');
  return !!b;
}
async function cartLines(tab) {
  await wait(tab, { any: [{ exists: SHOP.emptyCart }, { exists: SHOP.lineDelete }] }, 'the Deutsche Post cart');
  return tab.call('q', 'lines', SHOP.lineDelete);
}

// One product into the cart: its page, the product and destination checked, the quantity, In den Warenkorb.
// before = the cart's lines so far. Returns the unit price shown with the product.
async function addLine(tab, line, before, step) {
  const p = line.product, what = p.names[0];
  await tab.navigate(editorUrl(p));
  await wait(tab, { all: [{ exists: SHOP.selected }, { exists: SHOP.count }] }, `the product page of ${what}`);
  step();   // page
  const shown = (await tab.call('q', 'text', SHOP.selected)).split('\n').map(s => s.trim()).filter(Boolean);
  if (!p.names.some(n => shown.includes(n))) throw new Error(`Deutsche Post shows '${shown.join(' | ')}' as the product, expected ${p.names.join(' or ')}`);
  const dest = String(await tab.call('q', 'value', SHOP.destination) ?? '').trim();
  if (!dest || (p.country === 'DEU') !== (dest === SHOP.domestic)) throw new Error(`Deutsche Post shows the destination '${dest}', expected ${p.country === 'DEU' ? SHOP.domestic : 'international (not Deutschland)'}`);
  const price = euros(shown.join(' '));
  if (price.length !== 1) throw new Error(`no single price with ${what}: '${shown.join(' | ')}'`);
  step();   // product and destination
  await fill(tab, SHOP.count, String(line.qty));
  step();   // quantity
  // One click only: a second one while the first is still adding would put the stamps in twice.
  if (!(await tab.call('click', SHOP.addToCart))) throw new Error(`${SHOP.addToCart.what} was refused or is not there`);
  try {
    await wait(tab, { path: SHOP.cartPath }, `the cart after ${SHOP.addToCart.what}`);
    await wait(tab, { count: SHOP.lineDelete, min: before + 1 }, `the ${what} line in the cart`);
  } catch (e) { throw new Error(`${e.message}. In den Warenkorb was clicked: the stamps may be in the cart, check its tab`); }
  const now = await tab.call('q', 'lines', SHOP.lineDelete);
  if (now.length !== before + 1) throw new Error(`the cart shows ${now.length} line(s) after adding ${what}, expected ${before + 1}: ${now.map(l => l.title).join(', ')}`);
  step();   // in the cart
  return price[0];
}

// Progress steps. Stamp group: product page, product and destination checked, quantity, in the cart. A tracked
// label: refused (1). The cart: empty at the start, read at the end.
export const STEPS = { stamp: 4, tracked: 1, merge: 2 };

// The stamp groups of one product (one cart line) are added together: the shop could merge them anyway.
export async function buildCart({ stamps, tracked, windowId, log, onProgress = () => {} }) {
  const items = [...stamps.map(g => ({ kind: 'stamp', key: `${g.code} x${g.qty}`, g })), ...tracked.map(p => ({ kind: 'tracked', key: `${p.Id} ${p.Iso}`, p }))];
  const total = items.reduce((a, it) => a + STEPS[it.kind], 0) + STEPS.merge;
  let done = 0, finished = 0;
  const report = () => onProgress(Math.min(done, total), total, { items: finished, of: items.length });
  const fail = (it, error) => { it.ok = false; it.error = error; done += STEPS[it.kind] - (it.steps || 0); finished++; log(`${it.key}: FAILED: ${error}`); report(); };
  const summary = () => ({ items: items.map(r => ({ kind: r.kind, key: r.key, ok: !!r.ok, error: r.error || null, manual: false, total: r.total ?? null, ms: r.ms ?? null })) });
  report();

  const lines = new Map();
  for (const it of items) {
    if (it.kind === 'tracked') { fail(it, 'Deutsche Post has no tracked labels in cm-labels; buy it by hand'); continue; }
    let product;
    try { product = productFor(it.g); } catch (e) { fail(it, e.message); continue; }
    const k = `${product.id} ${product.country}`;
    if (!lines.has(k)) lines.set(k, { product, qty: 0, items: [] });
    const l = lines.get(k); l.qty += it.g.qty; l.items.push(it);
  }
  if (!lines.size) { done = total; report(); return { ...summary(), merged: false }; }

  const tab = await Tab.open(editorUrl([...lines.values()][0].product), { file: 'content/dp.js', ns: '__cmlDP', windowId });
  tab.onPoll = t => cookieBanner(t, log);
  const open = [...lines.values()].flatMap(l => l.items);
  // A cart that already holds lines (an earlier run, or the user's own) is not added to: paying it would pay twice.
  try {
    await wait(tab, { exists: SHOP.productList }, 'the Deutsche Post shop');   // the shop opens its cart for this tab
    await tab.navigate(SHOP.cart);
    const held = await cartLines(tab);
    if (held.length) throw new Error(`the Deutsche Post cart already holds ${held.length} line(s): ${held.map(l => l.title || l.text).join(', ')}. Nothing was added: pay or empty that cart first`);
    done++; report();
  } catch (e) {
    for (const it of open) fail(it, e.message);
    done = total; report();
    await tab.activate().catch(() => {});
    return { ...summary(), merged: false, error: e.message };
  }

  // One line after the other; after a failure the rest is not tried, so the cart holds only what this run checked.
  const added = [];
  let stop = null;
  for (const line of lines.values()) {
    if (stop) { for (const it of line.items) fail(it, `not tried: ${stop} failed first`); continue; }
    const step = () => { for (const it of line.items) { it.steps = (it.steps || 0) + 1; done++; } report(); };
    const t = Date.now();
    try {
      const unit = await addLine(tab, line, added.length, step);
      added.push(line);
      for (const it of line.items) { it.ok = true; it.total = cents(unit * it.g.qty); it.ms = Date.now() - t; finished++; }
      report();
      log(`${line.items.map(it => it.key).join(', ')}: ${line.product.names[0]} x${line.qty} in the cart (€ ${(unit * line.qty).toFixed(2)})`);
    } catch (e) {
      stop = line.items.map(it => it.key).join(', ');
      for (const it of line.items) fail(it, e.message);
    }
  }
  if (!added.length) { done = total; report(); await tab.activate().catch(() => {}); return { ...summary(), merged: false }; }

  // The cart as the shop shows it: one line per product, its quantity in the title, its price the last amount.
  let now;
  try {
    await tab.navigate(SHOP.cart);
    now = await cartLines(tab);
  } catch (e) {
    done = total; report();
    await tab.activate().catch(() => {});
    log(`Cart check FAILED: ${e.message}. The tab stays open with the cart`);
    return { ...summary(), merged: false, error: `Cart check failed: ${e.message}` };
  }
  const ok = items.filter(r => r.ok);
  const sum = cents(now.reduce((s, l) => s + (euros(l.text).pop() ?? NaN), 0));
  const expected = cents(ok.reduce((s, r) => s + r.total, 0));
  const entities = now.reduce((s, l) => s + lineQty(l.title), 0), stampsIn = ok.reduce((s, r) => s + r.g.qty, 0);
  const check = now.length === added.length && sum === expected && entities === stampsIn;
  try { await ext.tabs.ungroup?.(tab.id); } catch { }   // tab groups: not in every Firefox
  await tab.activate();
  done = total; report();
  log(`Cart: ${now.length} line(s) (${entities} stamps), total € ${Number.isNaN(sum) ? '?' : sum.toFixed(2)} (expected € ${expected.toFixed(2)} for ${added.length} line(s), ${stampsIn} stamps)${check ? '' : ' - CHECK THE CART'}`);
  return { ...summary(), merged: true, count: now.length, entities, total: Number.isNaN(sum) ? null : sum, expected, check };
}
