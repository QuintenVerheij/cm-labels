import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const { MESSAGES, t, cartName, setLang, currentLang, resolveLang, applyI18n } = await import('../extension/lib/messages.js');
const { cartVars } = await import('../extension/lib/messages.js');
globalThis.chrome ??= { tabs: {}, runtime: {}, storage: { local: {} } };
const { DEFAULTS } = await import('../extension/lib/store.js');

const sources = ['app.html', 'print.html', 'app.js', 'print.js', ...fs.readdirSync(path.join(root, 'lib')).filter(f => f.endsWith('.js')).map(f => `lib/${f}`)]
  .map(f => [f, fs.readFileSync(path.join(root, f), 'utf8')]);

// Keys the code asks for: t('key') (also either side of a ternary) and the data-i18n* attributes of the HTML.
function usedKeys() {
  const used = new Map();
  const add = (k, f) => { if (k) used.set(k, [...(used.get(k) || []), f]); };
  for (const [f, src] of sources) {
    for (const m of src.matchAll(/\bt\(\s*(?:[^'"`()]*\?\s*)?'([\w.]+)'(?:\s*:\s*'([\w.]+)')?/g)) { add(m[1], f); add(m[2], f); }
    for (const m of src.matchAll(/data-i18n(?:-html|-title|-aria-label|-placeholder)?="([\w.]+)"/g)) add(m[1], f);
  }
  return used;
}
const params = s => new Set([...s.matchAll(/\{([a-z]\w*)(?::|\})/g)].map(m => m[1]));

test('every key used in the code is in both languages', () => {
  const used = usedKeys();
  assert.ok(used.size > 150, `found ${used.size} keys`);
  for (const [k, files] of used) for (const l of ['en', 'de']) assert.ok(k in MESSAGES[l], `${l} lacks ${k} (used in ${files[0]})`);
});

test('en and de have the same keys, every key is used, and the parameters match', () => {
  assert.deepEqual(Object.keys(MESSAGES.de).sort(), Object.keys(MESSAGES.en).sort());
  const used = usedKeys();
  for (const k of Object.keys(MESSAGES.en)) {
    assert.ok(used.has(k), `${k} is not used anywhere`);
    if (k.startsWith('cart.name.')) continue;   // cartName passes both a plain and a hyphenated list
    const dropCarts = s => [...params(s)].filter(p => p !== 'carts').sort();   // German frames inflect on the number of carts
    assert.deepEqual(dropCarts(MESSAGES.de[k]), dropCarts(MESSAGES.en[k]), `parameters of ${k}`);
  }
});

test('English output is the text of the interface before it had languages', () => {
  setLang('en');
  const cases = [
    [t('status.running', { job: 'Loading paid orders' }), 'running: Loading paid orders'],
    [t('status.failed', { error: 'boom' }), 'failed: boom'],
    [t('log.failed', { name: 'print dialog', message: 'x' }), 'print dialog FAILED: x'],
    [t('log.plan', { stamps: '3 x NL-20', labels: 5, tracked: 2, byHand: 1 }), 'Stamps: 3 x NL-20 | address labels: 5 | tracked: 2 | by hand: 1'],
    [t('log.cartStart', { carrier: 'PostNL', codes: 2, labels: 1 }), 'PostNL: 2 stamp code group(s) + 1 shipping label(s), in parallel tabs...'],
    [t('log.cartDone', { names: 'PostNL and DHL', seconds: 4.2 }), 'PostNL and DHL done in 4.2 s.'],
    [t('cart.merged', { count: 3, total: '€ 4,50' }) + t('cart.inSeconds', { seconds: 5 }), '3 item(s) in one cart, total <b>€ 4,50</b>, in 5 s. The cart tab is in front: check it and pay there.'],
    [t('cart.noTabClosed', { name: 'PostNL' }), 'No tab was closed: check the PostNL tabs.'],
    [t('cart.doneMulti', { seconds: 9 }), 'Done in 9 s. Each cart is in a tab of its own: check them and pay there.'],
    [t('sheet.captionFirst', { i: 1, n: 2 }), 'Sheet 1 of 2: click a position to start there'],
    [t('sheet.caption', { i: 2, n: 2 }), 'Sheet 2 of 2'],
    [t('sheet.info', { w: 70, h: 40, n: 6 }), 'Label size: 70 × 40 mm, 6 labels per sheet.'],
    [t('prev.sheet', { w: 70, h: 40, cols: 3, rows: 7, sheets: 2 }), '70×40 mm, 3×7 per sheet, 2 sheet(s)'],
    [t('scope.chosen', { n: 1 }), '1 chosen order'],
    [t('scope.chosen', { n: 3 }), '3 chosen orders'],
    [t('age.hour', { h: 3, min: 7 }), '3 h 7 min ago'],
    [t('chip.sales', { n: 4 }), '4 sale(s)'],
    [t('info.codes', { stamps: 5, codes: 2, line: 'x' }), '5 stamp(s) in 2 code(s): x'],
    [t('info.labelsBad', { n: 3, bad: 1 }), '3 tracked label(s), 1 to do by hand'],
    [t('print.summarySheet', { n: 8, w: 70, h: 40, sheets: 1, pw: 210, ph: 297 }), '8 label(s) of 70×40 mm on 1 sheet(s) of 210×297 mm'],
    [t('saved.msg', { where: t('saved.turned', { w: 70, h: 40, r: 90, pageW: 40, pageH: 70 }), kind: t('saved.own') }), 'Saved: 70×40 mm, turned 90° on a 40×70 mm page, own layout.'],
    [t('postcode.bad', { country: 'NL', example: '1234 AB' }), 'That is not a NL postcode (like 1234 AB).'],
    [t('job.loadN', { n: 3 }), 'Loading 3 order(s)'],
    [t('job.cartThe', { cart: 'PostNL cart' }), 'Adding to the PostNL cart'],
    [t('panel.sum', { labels: 4, stamps: 3, codes: 2, tracked: 1 }), '4 label(s) · 3 stamp(s) in 2 code(s) · 1 tracked'],
    [t('panel.merged', { count: 2, name: 'DHL', total: '€ 3,00' }), '2 item(s) in the DHL cart, € 3,00'],
    [t('err.nothing', { carriers: 'PostNL or DHL' }), 'nothing for PostNL or DHL in this sale'],
    [t('printpage.turned', { r: 90 }), ' (the label is turned 90° on it)'],
    [t('size.cell'), 'A label must be at least 10 × 10 mm: use fewer columns or rows.'],
    [t('msg.layoutEmpty'), 'The layout is empty: click "Default layout for this size".'],
    [t('help.fields.postcode'), 'From the city line of Cardmarket. If the postcode is not found, <code>{CITY}</code> has the full line.'],
  ];
  assert.ok(cases.length >= 15);
  for (const [got, want] of cases) assert.equal(got, want);
  assert.equal(cartName([]), 'cart');
  assert.equal(cartName(['PostNL']), 'PostNL cart');
  assert.equal(cartName(['PostNL', 'DHL']), 'PostNL and DHL carts');
  assert.equal(cartName(['A', 'B', 'C']), 'A, B and C carts');
});

test('German output picks the plural and keeps the carrier names', () => {
  setLang('de');
  try {
    assert.equal(t('chip.sales', { n: 1 }), '1 Verkauf');
    assert.equal(t('chip.sales', { n: 4 }), '4 Verkäufe');
    assert.equal(cartName(['PostNL']), 'PostNL-Warenkorb');
    assert.equal(cartName(['PostNL', 'DHL']), 'PostNL- und DHL-Warenkörben');
    assert.equal(cartName(['A', 'B', 'C']), 'A-, B- und C-Warenkörben');
    assert.equal(t('cart.add', cartVars(['Deutsche Post'])), 'Zum Deutsche Post-Warenkorb hinzufügen');
    assert.equal(t('cart.add', cartVars(['PostNL', 'DHL'])), 'Zu den PostNL- und DHL-Warenkörben hinzufügen');
    assert.equal(t('status.idle'), 'bereit');
    assert.equal(t('no.such.key'), 'no.such.key');
  } finally { setLang('en'); }
});

test('the language follows the setting, else the browser language; English is the default', () => {
  assert.equal(currentLang(), 'en');
  assert.equal(DEFAULTS.uiLang, 'auto');
  assert.equal(resolveLang('auto', 'de'), 'de');
  assert.equal(resolveLang('auto', 'de-AT'), 'de');
  assert.equal(resolveLang('auto', 'DE-de'), 'de');
  assert.equal(resolveLang('auto', 'en-US'), 'en');
  assert.equal(resolveLang('auto', 'nl-NL'), 'en');
  assert.equal(resolveLang('auto', undefined), 'en');
  assert.equal(resolveLang(undefined, 'de-DE'), 'de');
  assert.equal(resolveLang('en', 'de-DE'), 'en');
  assert.equal(resolveLang('de', 'en-US'), 'de');
  assert.equal(resolveLang('fr', 'en-US'), 'en');
  setLang(resolveLang('de', 'en-US'));
  assert.equal(currentLang(), 'de');
  setLang('fr');
  assert.equal(currentLang(), 'en');
});

test('applyI18n fills text, markup and attributes and sets the document language', () => {
  const el = (attrs) => ({ dataset: {}, attrs: { ...attrs }, textContent: '', innerHTML: '', setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } });
  const text = el(), html = el(), title = el({ 'data-i18n-title': 'panel.close' });
  text.dataset.i18n = 'nav.run'; html.dataset.i18nHtml = 'help.fields.address';
  const root = {
    documentElement: {},
    querySelectorAll: sel => sel === '[data-i18n]' ? [text] : sel === '[data-i18n-html]' ? [html] : sel === '[data-i18n-title]' ? [title] : [],
  };
  setLang('de');
  try {
    applyI18n(root);
    assert.equal(root.documentElement.lang, 'de');
    assert.equal(text.textContent, 'Ausführen');
    assert.match(html.innerHTML, /<code>&lt;br&gt;<\/code>/);
    assert.equal(title.attrs.title, 'Schließen');
  } finally { setLang('en'); }
});

// A file that imports t must not declare its own t where it also calls t(...): the call would hit the local.
const shadowing = src => {
  const hits = [];
  const bind = /\b(?:const|let|var)\s+t\b|\bfunction\s*\w*\s*\([^)]*\bt\b[^)]*\)|\(\s*(?:[^()]*,\s*)?t\s*(?:,[^()]*)?\)\s*=>|\bt\s*=>/g;
  for (const m of src.matchAll(bind)) {
    const rest = src.slice(m.index + m[0].length);
    const scope = m[0].endsWith('=>') ? rest.split('\n')[0] : rest;
    if (/(?<![\w.$'"])t\(/.test(scope)) hits.push(m[0]);
  }
  return hits;
};

test('no file that imports t declares its own t next to a call of t', () => {
  const importing = sources.filter(([, src]) => /import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*'[^']*messages\.js'/.test(src));
  assert.ok(importing.length >= 5, `found ${importing.length} files`);
  for (const [f, src] of importing) assert.deepEqual(shadowing(src), [], `${f} shadows t`);
  assert.deepEqual(shadowing("const t = Date.now();\nlog(t('x'));"), ['const t']);
  assert.deepEqual(shadowing("function addressText(t) {\n  return t('a');\n}"), ['function addressText(t)']);
  assert.deepEqual(shadowing("rows.map(t => t('a'))"), ['t =>']);
  assert.deepEqual(shadowing("rows.filter(t => !t.error);\nlog(t('a'));"), []);
});
