import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planSales } from '../extension/lib/plan.js';

const el = (text, classes = [], extra = {}) => ({ textContent: text, classList: { contains: c => classes.includes(c) }, className: classes.join(' '), ...extra });

// A fake sale page: just the queries content/cm.js makes in sale().
function readSale({ lines, method = ['Standard Letter', 'max. 20 g', 'No tracking'], value = '12.50', text = '' }) {
  const dts = [];
  if (method) {
    const spans = [el(method[0]), el(method[1], ['text-muted'])];
    dts.push(el('Shipping Method:', [], { nextElementSibling: el('', [], { querySelectorAll: () => spans, querySelector: () => el(method[2]) }) }));
  }
  const sum = value === null ? null : { getAttribute: n => (n === 'data-item-value' ? value : '3') };
  const document = {
    querySelector: sel => (sel === '#ShippingAddress' ? {} : sel === '[data-item-value]' ? sum : null),
    querySelectorAll: sel => (sel === '#ShippingAddress > div' ? lines : sel === '#collapsibleOtherInfo dt' ? dts : []),
    body: { textContent: text, innerText: '' },
  };
  const window = {};
  new Function('window', 'document', 'location', readFileSync(new URL('../extension/content/cm.js', import.meta.url), 'utf8'))(window, document, { href: 'https://www.cardmarket.com/en/Magic/Orders/1' });
  return window.__cmlCM.sale('1234567890');
}

const addr = [el('Jan Jansen', ['Name']), el('Kerkstraat 1', ['Street']), el('1234AB Utrecht', ['City']), el('Netherlands', ['Country'])];

test('an address line with extra classes still gives its kind', () => {
  const r = readSale({ lines: [el('Jan Jansen', ['Name', 'text-truncate']), ...addr.slice(1)] });
  assert.equal(r.lines[0].kind, 'Name');
});

test('a sale page with no Shipping Method row gives an error', () => {
  const r = readSale({ lines: addr, method: null });
  assert.equal(r.error, 'shipping method not found on page');
});

test('a missing or unreadable article value is null', () => {
  assert.equal(readSale({ lines: addr, value: null }).value, null);
  assert.equal(readSale({ lines: addr, value: '' }).value, null);
  assert.equal(readSale({ lines: addr, value: 'abc' }).value, null);
  assert.equal(readSale({ lines: addr, value: '12.50' }).value, 12.5);
});

test('a weight with a thousands separator is read in full', () => {
  assert.equal(readSale({ lines: addr, method: ['Parcel', 'max. 1,000 g', 'Tracked'] }).grams, 1000);
  assert.equal(readSale({ lines: addr, method: ['Letter', 'max. 20 g', 'No tracking'] }).grams, 20);
});

const cfg = { byName: { Netherlands: 'NL' }, countries: { NL: ['x', 'Netherlands', '\\d{4}[A-Z]{2}'] }, methods: {} };
const sale = value => ({ id: '1', methodName: 'Standard Letter', method: 'Standard Letter max. 20 g', grams: 20, tracked: false, value, lines: [{ kind: 'Country', text: 'Netherlands' }] });
const plan = value => planSales([sale(value)], cfg);

test('an untracked sale of exactly 25.00 is skipped', () => {
  const p = plan(25);
  assert.equal(p.print.length, 0);
  assert.equal(p.skipped.length, 1);
});

test('an untracked sale just under 25.00 is printed', () => {
  assert.equal(plan(24.99).print.length, 1);
});

test('an untracked sale with no readable value is skipped with a reason that says so', () => {
  for (const v of [null, undefined, NaN, Infinity]) {
    const p = plan(v);
    assert.equal(p.print.length, 0);
    assert.match(p.skipped[0].reason, /could not be read/);
  }
});

// The Summary block of a sale page, as its text reads (English page; the amounts use a decimal comma).
const SUMMARY_EN = 'Summary Contents 1 Articles Article Value 10,95 € Shipping 1,70 € Total 12,65 € Shipping address';
test('the summary gives the shipping cost and the total order cost', () => {
  const r = readSale({ lines: addr, text: SUMMARY_EN });
  assert.equal(r.shipping, 1.7);
  assert.equal(r.total, 12.65);
  assert.equal(r.value, 12.5);   // the article value still comes from data-item-value
  assert.equal(r.articles, 3);
});

test('the summary reads thousands separators and text without spaces between label and amount', () => {
  const r = readSale({ lines: addr, text: 'Article Value1.234,50 €Shipping12,00 €Total1.246,50 €' });
  assert.equal(r.shipping, 12);
  assert.equal(r.total, 1246.5);
});

test('a page without a readable summary gives no shipping and no total', () => {
  const r = readSale({ lines: addr, text: 'Article Value about 10 euro' });
  assert.equal(r.shipping, null);
  assert.equal(r.total, null);
  assert.equal(readSale({ lines: addr }).total, null);
});
