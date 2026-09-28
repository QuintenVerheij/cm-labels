import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { byNameOf, COUNTRY_DE } from '../extension/lib/locale.js';

const el = (text, classes = [], extra = {}) => ({ textContent: text, classList: { contains: c => classes.includes(c) }, className: classes.join(' '), ...extra });

// The same sale page in either language: the texts differ, the structure is Cardmarket's.
const PAGES = {
  en: {
    href: 'https://www.cardmarket.com/en/Magic/Orders/1234567890',
    country: 'Germany', method: 'Shipping Method:', flags: 'Tracked', tracking: 'Tracking Code:', phone: 'Phone Number:', mail: 'E-mail:', saleNo: 'Sale #1234567890', pages: 'Page 1 of 3',
  },
  de: {
    href: 'https://www.cardmarket.com/de/Magic/Orders/1234567890',
    country: 'Deutschland', method: 'Versandart:', flags: 'Keine Sendungsverfolgung', tracking: 'Sendungsnummer:', phone: 'Telefonnummer:', mail: 'E-Mail:', saleNo: 'Verkauf #1234567890', pages: 'Seite 1 von 3',
  },
};

function load(p, { tracked }) {
  const flags = tracked ? 'Tracked' : p.flags === 'Tracked' ? 'No tracking' : p.flags;
  const spans = [el('Standard Letter'), el('max. 1,000 g', ['text-muted'])];
  const md = el('', [], { querySelectorAll: () => spans, querySelector: () => el(flags) });
  const dts = [
    el(p.method, [], { nextElementSibling: md }),
    el(p.tracking, [], { nextElementSibling: el('RR123456789NL') }),
    el(p.phone, [], { nextElementSibling: el('0612345678') }),
    el(p.mail, [], { nextElementSibling: el('jan@example.com') }),
  ];
  const lines = [el('Jan Jansen', ['Name']), el('Kerkstraat 1', ['Street']), el('12345 Berlin', ['City']), el(p.country, ['Country'])];
  const sum = { getAttribute: n => (n === 'data-item-value' ? '12.50' : '3') };
  const document = {
    querySelector: sel => (sel === '#ShippingAddress' ? {} : sel === '[data-item-value]' ? sum : null),
    querySelectorAll: sel => (sel === '#ShippingAddress > div' ? lines : sel === '#collapsibleOtherInfo dt' ? dts : []),
    body: { textContent: `${p.pages} ${p.saleNo}`, innerText: '' },
    title: '', readyState: 'complete',
  };
  const window = {};
  new Function('window', 'document', 'location', readFileSync(new URL('../extension/content/cm.js', import.meta.url), 'utf8'))(window, document, { href: p.href });
  return window.__cmlCM;
}


const strip = ({ lines, ...r }) => r;

test('a German and an English sale page give the same sale', () => {
  const de = load(PAGES.de, { tracked: true }).sale('1234567890');
  const en = load(PAGES.en, { tracked: true }).sale('1234567890');
  assert.equal(de.error, undefined);
  assert.deepEqual(strip(de), strip(en));
  assert.deepEqual(de.lines.slice(0, 3), en.lines.slice(0, 3));
  assert.equal(de.grams, 1000);
  assert.equal(de.trackingCode, 'RR123456789NL');
  assert.equal(de.phone, '0612345678');
  assert.equal(de.email, 'jan@example.com');
});

test('German "no tracking" text marks the sale untracked, like the English text', () => {
  const de = load(PAGES.de, { tracked: false }).sale('1234567890');
  const en = load(PAGES.en, { tracked: false }).sale('1234567890');
  assert.equal(de.tracked, false);
  assert.equal(en.tracked, false);
});

test('the English labels still parse on a German page', () => {
  const r = load({ ...PAGES.en, href: PAGES.de.href }, { tracked: true }).sale('1234567890');
  assert.equal(r.error, undefined);
  assert.equal(r.grams, 1000);
});

test('the list page count and the sale number are read in both languages', () => {
  for (const p of Object.values(PAGES)) {
    const cm = load(p, { tracked: true });
    assert.equal(cm.list().pages, 3);
    assert.equal(cm.hasSale('1234567890'), true);
    assert.equal(cm.hasSale('1111111111'), false);
  }
});

test('country names of both languages resolve to the same ISO code', () => {
  const countries = JSON.parse(readFileSync(new URL('../extension/data/countries.json', import.meta.url), 'utf8'));
  const byName = byNameOf(countries);
  for (const [iso, v] of Object.entries(countries)) {
    assert.equal(byName[v[0]], iso);
    if (COUNTRY_DE[iso]) assert.equal(byName[COUNTRY_DE[iso]], iso);
  }
  assert.equal(byName.Deutschland, 'DE');
  assert.equal(byName.Niederlande, 'NL');
  assert.equal(byName.Großbritannien, 'GB');
  assert.deepEqual(Object.keys(COUNTRY_DE).sort(), Object.keys(countries).sort());
});
