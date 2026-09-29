import test from 'node:test';
import assert from 'node:assert/strict';

// A small fake of the shop: pages as element trees, document.querySelectorAll answering from the page's
// selector table, and chrome.tabs/scripting driving the real content script (content/dp.js) in this process.
const H = 'h1,h2,h3,h4,h5,h6';
const InputProto = { set value(v) { this._v = String(v); }, get value() { return this._v ?? ''; } };
let clicks = [];
function el(tag, { text = '', attrs = {}, children = [], onClick, label, value } = {}) {
  const e = {
    tagName: tag.toUpperCase(), type: attrs.type || 'text', disabled: !!attrs.disabled, readOnly: false, parentElement: null, children,
    get innerText() { return [text, ...children.map(c => c.innerText)].filter(Boolean).join('\n'); },
    getAttribute: k => attrs[k] ?? null,
    click() { clicks.push(text || attrs['aria-label']); onClick?.(); },
    querySelectorAll(sel) {
      const out = [], walk = n => n.children.forEach(c => { if (sel === 'input' ? c.tagName === 'INPUT' : sel === H && /^H\d$/.test(c.tagName)) out.push(c); walk(c); });
      walk(this);
      return out;
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    contains(x) { for (let c = x; c; c = c.parentElement) if (c === this) return true; return false; },
    getClientRects: () => [{}], dispatchEvent() {}, focus() {}, blur() {}, scrollIntoView() {},
  };
  if (tag === 'input') { Object.setPrototypeOf(e, InputProto); e.value = value ?? ''; }
  if (label) e.labels = [{ innerText: label }];
  children.forEach(c => { c.parentElement = e; });
  return e;
}
let page = {};
globalThis.window = globalThis;
globalThis.location = { pathname: '/' };
globalThis.document = { title: '', querySelectorAll: sel => page[sel] || [] };
globalThis.Event = class {}; globalThis.FocusEvent = class {};
globalThis.getComputedStyle = () => ({ visibility: 'visible' });

const shop = { cart: [], adds: 0, edit: p => p, opened: [] };
let current = '';
globalThis.chrome = {
  runtime: {},
  tabs: {
    async create({ url }) { shop.opened.push(url); go(url); return { id: 5, windowId: 1 }; },
    async update(id, o) { if (o.url) go(o.url); return { id, windowId: 1 }; },
    async get(id) { return { id, status: 'complete', url: current }; },
    async group() { return 1; }, async ungroup() {},
  },
  tabGroups: { async update() {} },
  windows: { async update() {} },
  scripting: { async executeScript({ func, args, files }) { return files ? [] : [{ result: await func(...args) }]; } },
};
await import('../extension/content/dp.js');
const dp = await import('../extension/lib/deutschepost.js');
const { SHOP, productFor, buildCart } = dp;

const PRICES = { 'BRF0020 DEU': ['Standardbrief', 0.95], 'BRF0050 DEU': ['Kompaktbrief', 1.1], 'BRF0500 DEU': ['Großbrief', 1.8], 'BRF1000 DEU': ['Maxibrief', 2.9], 'BRF0020 QMZ': ['Standardbrief International', 1.25] };
const fmt = x => `${x.toFixed(2).replace('.', ',')} €`;
function cartLine({ name, qty, unit }) {
  const del = el('button', { attrs: { 'aria-label': 'Position löschen' } });
  return { del, line: el('div', { children: [el('div', { children: [el('h3', { text: qty > 1 ? `${qty} x ${name}` : name }), el('span', { text: 'ohne Adresse' })] }), el('div', { children: [del] }), el('p', { text: fmt(unit * qty) })] }) };
}
function go(url) {
  current = url;
  const u = new URL(url);
  location.pathname = u.pathname;
  if (u.pathname === '/checkout') {
    document.title = 'Warenkorb';
    const lines = shop.cart.map(cartLine);
    el('div', { children: lines.map(l => l.line) });
    page = lines.length ? { [SHOP.lineDelete.sel]: lines.map(l => l.del), button: lines.map(l => l.del) } : { [SHOP.emptyCart.sel]: [el('div')] };
    return;
  }
  document.title = 'Online Frankieren';
  const key = `${u.searchParams.get('productId')} ${u.searchParams.get('receiverCountry')}`;
  const [name, unit] = PRICES[key];
  const row = el('div', { attrs: { role: 'row', 'aria-selected': 'true' }, children: [el('span', { text: 'bis 20 g' }), el('h4', { text: name }), el('span', { text: fmt(unit) })] });
  const dest = el('input', { label: 'Zielland / Zielregion', value: key.endsWith('DEU') ? 'Deutschland' : 'International' });
  const count = el('input', { value: '1' });
  const group = el('div', { attrs: { role: 'group' }, children: [count] });
  const add = el('button', { text: 'In den Warenkorb', onClick: () => { shop.adds++; shop.cart.push({ name, qty: +count.value, unit }); go('https://shop.deutschepost.de/checkout'); } });
  page = shop.edit({ [SHOP.productList.sel]: [el('div', { children: [row] })], [SHOP.selected.sel]: [row], input: [dest, count], [SHOP.count.sel]: [group], button: [add, el('button', { text: 'Adresseingabe' })] }, { row, dest, count, add, name });
}
const reset = () => { shop.cart = []; shop.adds = 0; shop.edit = p => p; shop.opened = []; clicks = []; SHOP.waitMs = 30000; };
const at = path => { location.pathname = path; };
const DP = () => window.__cmlDP;
const g = (code, qty) => { const [iso, w] = code.split('-'); return { code, iso, weight: +w, country: iso, qty, ids: [], weights: [], carrier: 'deutschepost' }; };
const run = (stamps, tracked = []) => { const log = []; return buildCart({ stamps, tracked, windowId: 1, log: l => log.push(l) }).then(r => ({ ...r, log })); };

test('click never pays: refused on the cart and checkout pages and for any paying or ordering text', () => {
  reset();
  const b = text => { const e = el('button', { text }); page = { button: [e] }; return e; };
  at('/digital-frankieren');
  b('In den Warenkorb');
  assert.equal(DP().click(SHOP.addToCart), true);
  for (const path of ['/checkout', '/checkout/bezahlen', '/shop/warenkorb/index.jsp', '/shop/kasse/zahlungsart.jsp']) {
    at(path); b('In den Warenkorb');
    assert.equal(DP().click(SHOP.addToCart), false, path);
  }
  at('/digital-frankieren');
  for (const text of ['Zahlungspflichtig bestellen', 'Jetzt kaufen', 'Zur Kasse', 'Bezahlen', 'Weiter zur Zahlung', 'Mit PayPal zahlen', 'Place order']) {
    b(text);
    assert.equal(DP().click({ sel: 'button', text }), false, text);
  }
  const labelled = el('button', { attrs: { 'aria-label': 'Jetzt bezahlen' } });
  page = { button: [labelled] };
  assert.equal(DP().click({ sel: 'button' }), false);
  assert.deepEqual(clicks, ['In den Warenkorb']);
});

test('a changed page is never acted on by guess: several matches, a disabled button or a non-field fail with a message', () => {
  reset(); at('/digital-frankieren');
  page = { button: [el('button', { text: 'In den Warenkorb' }), el('button', { text: 'In den Warenkorb' })] };
  assert.throws(() => DP().click(SHOP.addToCart), /2 elements for In den Warenkorb button, expected 1/);
  page = { button: [el('button', { text: 'In den Warenkorb', attrs: { disabled: true } })] };
  assert.throws(() => DP().click(SHOP.addToCart), /In den Warenkorb button is disabled/);
  page = { button: [el('button', { text: 'Zurück' })] };
  assert.equal(DP().click(SHOP.addToCart), false);   // not there (yet): the caller waits or fails with its name
  // the count group with two inputs, with none, and no group at all
  page = { [SHOP.count.sel]: [el('div', { children: [el('input'), el('input')] })] };
  assert.throws(() => DP().fill(SHOP.count, '3'), /2 elements for Anzahl field/);
  page = { [SHOP.count.sel]: [el('div', { children: [el('span')] })] };
  assert.equal(DP().fill(SHOP.count, '3'), null);
  page = {};
  assert.equal(DP().fill(SHOP.count, '3'), null);
  page = { [SHOP.count.sel]: [el('input', { attrs: { type: 'hidden' } })] };
  assert.throws(() => DP().fill(SHOP.count, '3'), /Anzahl field is not a field to type in/);
  // the destination is found by its label only; two such fields are an error
  const dest = el('input', { label: 'Zielland / Zielregion', value: 'Deutschland' });
  page = { input: [el('input', { label: 'Suchbegriff' }), dest] };
  assert.equal(DP().q('value', SHOP.destination), 'Deutschland');
  page = { input: [dest, el('input', { label: 'Zielland / Zielregion' })] };
  assert.throws(() => DP().q('value', SHOP.destination), /2 elements for Zielland \/ Zielregion field/);
  page = {};
  assert.throws(() => DP().q('value', SHOP.destination), /no Zielland \/ Zielregion field on the page/);
});

test('fill types into the one input of the count group and reads back the value', () => {
  reset(); at('/digital-frankieren');
  const input = el('input', { value: '1' });
  page = { [SHOP.count.sel]: [el('div', { children: [input] }), input] };   // the label on the group and on its input
  assert.equal(DP().fill(SHOP.count, '7'), '7');
  assert.equal(input.value, '7');
});

test('the cart lines are read per delete button, each with its own title and price', () => {
  reset();
  shop.cart = [{ name: 'Standardbrief', qty: 3, unit: 0.95 }, { name: 'Maxibrief', qty: 1, unit: 2.9 }];
  go('https://shop.deutschepost.de/checkout');
  assert.deepEqual(DP().q('lines', SHOP.lineDelete), [{ title: '3 x Standardbrief', text: '3 x Standardbrief ohne Adresse 2,85 €' }, { title: 'Maxibrief', text: 'Maxibrief ohne Adresse 2,90 €' }]);
  shop.cart = [{ name: 'Großbrief', qty: 1, unit: 1.8 }];
  go('https://shop.deutschepost.de/checkout');
  assert.deepEqual(DP().q('lines', SHOP.lineDelete), [{ title: 'Großbrief', text: 'Großbrief ohne Adresse 1,80 €' }]);
});

test('the cookie banner is answered only through a visible refuse button', () => {
  reset();
  const btn = el('button', { text: 'Alle ablehnen' });
  page = { [SHOP.cookieRefuse.sel]: [btn] };
  assert.equal(DP().cookie(SHOP.cookieRefuse), true);
  btn.getClientRects = () => [];
  assert.equal(DP().cookie(SHOP.cookieRefuse), false);
  at('/checkout');   // on the cart page too: only clicks that could pay are refused there
  page = { [SHOP.cookieRefuse.sel]: [el('button', { text: 'Alle ablehnen' })] };
  assert.equal(DP().cookie(SHOP.cookieRefuse), true);
  assert.deepEqual(clicks, ['Alle ablehnen', 'Alle ablehnen']);
});

test('the cookie answer never clicks an element that speaks of paying, by its text or its aria-label', () => {
  reset(); at('/digital-frankieren');
  for (const e of [el('button', { text: 'Jetzt bezahlen' }), el('button', { attrs: { 'aria-label': 'Jetzt bezahlen' } }), el('button', { text: 'Alle ablehnen', attrs: { 'aria-label': 'Jetzt bezahlen' } })]) {
    page = { [SHOP.cookieRefuse.sel]: [e] };
    assert.equal(DP().cookie(SHOP.cookieRefuse), false);
  }
  assert.deepEqual(clicks, []);
});

test('stamp brackets map to the shop products; abroad only the 20 g letter', () => {
  assert.deepEqual(dp.BRACKETS, [20, 50, 500, 1000]);
  assert.deepEqual([20, 50, 500, 1000].map(w => productFor(g(`DE-${w}`, 1)).id), ['BRF0020', 'BRF0050', 'BRF0500', 'BRF1000']);
  assert.deepEqual([productFor(g('DE-20', 1)).country, productFor(g('FR-20', 1)).country], ['DEU', 'QMZ']);
  assert.throws(() => productFor(g('FR-50', 1)), /no 50 g letter abroad/);
});

test('buildCart fills one cart in one tab, one line per product, and ends on the cart page with a checked total', async () => {
  reset();
  const r = await run([g('DE-20', 2), g('DE-500', 1), g('FR-20', 1), g('AT-20', 2)]);
  assert.equal(shop.opened.length, 1);
  assert.deepEqual(shop.cart.map(l => [l.name, l.qty]), [['Standardbrief', 2], ['Großbrief', 1], ['Standardbrief International', 3]]);
  assert.deepEqual(r.items.map(i => [i.key, i.ok, i.total]), [['DE-20 x2', true, 1.9], ['DE-500 x1', true, 1.8], ['FR-20 x1', true, 1.25], ['AT-20 x2', true, 2.5]]);
  // count is the items (4: the UI says "4 items"), though FR-20 and AT-20 share one of the 3 lines
  assert.deepEqual([r.merged, r.count, r.entities, r.total, r.expected, r.check], [true, 4, 6, 7.45, 7.45, true]);
  assert.equal(location.pathname, '/checkout');
});

test('buildCart refuses a cart that already holds lines, and adds nothing', async () => {
  reset();
  shop.cart = [{ name: 'Maxibrief', qty: 1, unit: 2.9 }];
  const r = await run([g('DE-20', 1)]);
  assert.equal(shop.adds, 0);
  assert.equal(r.merged, false);
  assert.match(r.error, /cart already holds 1 line: Maxibrief\. Nothing was added/);
  assert.deepEqual(r.items.map(i => [i.ok, i.error === r.error]), [[false, true]]);
});

test('buildCart adds nothing when the page shows another product or a domestic destination for a letter abroad', async () => {
  reset();
  shop.edit = (p, { row }) => { row.children[1] = el('h4', { text: 'Kompaktbrief' }); return p; };
  let r = await run([g('DE-20', 1), g('DE-50', 1)]);
  assert.equal(shop.adds, 0);
  assert.match(r.items[0].error, /shows 'bis 20 g \| Kompaktbrief \| 0,95 €' as the product, expected Standardbrief/);
  assert.match(r.items[1].error, /not tried: DE-20 x1 failed first/);
  assert.equal(r.merged, false);
  reset();
  shop.edit = (p, { dest }) => { dest.value = 'Deutschland'; return p; };
  r = await run([g('FR-20', 1)]);
  assert.equal(shop.adds, 0);
  assert.match(r.items[0].error, /destination 'Deutschland', expected international/);
});

test('a quantity field that takes its value back fails loudly, and nothing is added', async () => {
  reset();
  // the field shows the typed number at first, then goes back to 1 (as a number field of the shop could)
  shop.edit = (p, { count }) => {
    Object.setPrototypeOf(count, { set value(v) { this._v = String(v); setTimeout(() => { this._v = '1'; }); }, get value() { return this._v ?? ''; } });
    return p;
  };
  const r = await run([g('DE-20', 3)]);
  assert.equal(shop.adds, 0);
  assert.equal(r.merged, false);
  assert.match(r.items[0].error, /Anzahl field holds '1', expected '3'/);
});

test('a cart with an extra line after In den Warenkorb fails the product, and the next one is not tried', async () => {
  reset();
  // the shop (or another tab) puts a second line in the cart with this product
  shop.edit = (p, { count, name }) => ({ ...p, button: [el('button', { text: 'In den Warenkorb', onClick: () => {
    shop.adds++;
    shop.cart.push({ name, qty: +count.value, unit: 0.95 }, { name: 'Maxibrief', qty: 1, unit: 2.9 });
    go('https://shop.deutschepost.de/checkout');
  } })] });
  const r = await run([g('DE-20', 2), g('DE-50', 1)]);
  assert.equal(shop.adds, 1);
  assert.deepEqual(r.items.map(i => i.ok), [false, false]);
  assert.match(r.items[0].error, /the cart shows 2 lines after adding Standardbrief, expected 1: 2 x Standardbrief, Maxibrief/);
  assert.match(r.items[1].error, /not tried: DE-20 x2 failed first/);
  assert.equal(r.merged, false);
});

test('an unknown product page fails with the page it is on, before anything is filled', async () => {
  reset();
  SHOP.waitMs = 300;
  shop.edit = () => ({ button: [el('button', { text: 'In den Warenkorb' })] });
  const r = await run([g('DE-20', 1)]);
  assert.equal(shop.adds, 0);
  assert.match(r.error, /Deutsche Post page unknown or changed: timeout waiting for the Deutsche Post shop.*\(the tab is on \/digital-frankieren, 'Online Frankieren'\)/);
  reset();
});

test('tracked labels are refused without opening a tab', async () => {
  reset();
  const r = await run([], [{ Id: '9', Iso: 'DE', carrier: 'deutschepost' }]);
  assert.deepEqual([shop.opened.length, r.merged, r.items[0].ok], [0, false, false]);
  assert.match(r.items[0].error, /no tracked labels/);
});
