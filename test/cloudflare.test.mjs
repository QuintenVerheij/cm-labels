import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A tiny document over an HTML string: enough of querySelector for the selectors content/cm.js uses.
function pageState(html, { title = '', text = '' } = {}) {
  const attr = (name, value) => new RegExp(`\\b${name}="${value}`).test(html);
  const document = {
    title, readyState: 'complete', body: { innerText: text },
    querySelector(sel) {
      let m;
      if ((m = sel.match(/^#([\w-]+)$/))) return attr('id', `${m[1]}"`) ? {} : null;
      if ((m = sel.match(/^\[id\^="([\w-]+)"\]$/))) return attr('id', m[1]) ? {} : null;
      if ((m = sel.match(/^(\w+)\[(\w+)\*="([^"]+)"\]$/))) return new RegExp(`<${m[1]}[^>]*\\b${m[2]}="[^"]*${m[3].replace(/[/.]/g, '\\$&')}`).test(html) ? {} : null;
      throw new Error(`fixture document does not support ${sel}`);
    },
  };
  const window = {};
  new Function('window', 'document', 'location', readFileSync(new URL('../extension/content/cm.js', import.meta.url), 'utf8'))(window, document, { href: 'https://www.cardmarket.com/en/Magic/Orders/1' });
  return window.__cmlCM.state();
}

const challengeEn = { title: 'Just a moment...', text: 'Performing security verification' };
const challengeDe = { title: 'Einen Moment …', text: 'Bestätigen Sie, dass Sie ein Mensch sind' };
const blockEn = { title: 'Attention Required! | Cloudflare', text: 'Sorry, you have been blocked' };
const blockDe = { title: 'Zugriff verweigert', text: 'Sie wurden blockiert' };

test('a German challenge page is a challenge by its markup', () => {
  const s = pageState('<html><form id="challenge-form"></form></html>', challengeDe);
  assert.equal(s.check, true);
  assert.equal(s.block, false);
});

test('a challenge is found by the challenge-platform script on an almost empty page', () => {
  const s = pageState('<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>', { title: 'Un instant…', text: '' });
  assert.equal(s.check, true);
});

test('a cf- challenge id marks a challenge', () => {
  assert.equal(pageState('<div id="cf-chl-widget-abc"></div>', challengeDe).check, true);
});

test('the challenge-platform beacon on a normal, full page is not a challenge', () => {
  const s = pageState('<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>', { title: 'Sales', text: 'x'.repeat(400) });
  assert.equal(s.check, false);
});

test('a German block page is a block by its markup', () => {
  const s = pageState('<div id="cf-wrapper"><div id="cf-error-details"></div></div>', blockDe);
  assert.equal(s.block, true);
  assert.equal(s.check, false);
});

test('the English text alone still detects a challenge, a block and a rate limit', () => {
  assert.equal(pageState('<html></html>', challengeEn).check, true);
  assert.equal(pageState('<html></html>', blockEn).block, true);
  assert.equal(pageState('<html></html>', { title: '429', text: 'Too Many Requests' }).limited, true);
});

test('a normal page is neither a challenge, a block nor rate limited', () => {
  const s = pageState('<a href="/en/Magic/User_Logout">x</a>', { title: 'Cardmarket', text: 'Orders' });
  assert.deepEqual([s.check, s.block, s.limited], [false, false, false]);
});

// loadSales against a fake Tab. cardmarket.js pulls in ext.js, which needs an extension global to load.
globalThis.chrome ??= { tabs: {}, runtime: {}, storage: {} };
const { loadSales } = await import('../extension/lib/cardmarket.js');
const { Tab } = await import('../extension/lib/tabs.js');

const IDS = Array.from({ length: 12 }, (_, i) => String(1000000000 + i));

// pageFor(url) gives the state of the page a tab shows after navigating to url.
function runWith(pageFor) {
  const opened = [];
  Tab.open = async () => {
    const tab = {
      url: '', closed: false, navigations: 0,
      async navigate(url) { this.url = url; this.navigations++; },
      async safe(name, fallback, id) {
        if (name === 'state') return pageFor(this.url);
        if (name === 'hasSale') return pageFor(this.url).sale === id;
        return fallback;
      },
      async call(name, id) { return name === 'list' ? { ids: IDS, pages: 1 } : { id, lines: [] }; },
      async activate() {}, async close() { this.closed = true; },
    };
    opened.push(tab);
    return tab;
  };
  const run = () => loadSales('Paid', { log() {}, onLogin() {}, saleMs: 100 });
  return { run, opened };
}

const ok = url => ({ ready: 'complete', check: false, block: false, limited: false, loggedIn: true, url, sale: url.split('/').pop() });
const listPage = url => ({ ...ok(url), sale: null });
const challenge = url => ({ ...ok(url), check: true, sale: null });
const isSale = url => url.includes('/Orders/1');

test('three timeouts in a row on a challenge stop the run as blocked', async () => {
  const { run, opened } = runWith(url => (isSale(url) ? challenge(url) : listPage(url)));
  await assert.rejects(run(), e => e.constructor.name === 'Blocked');
  const sales = opened.reduce((n, t) => n + t.navigations, 0) - 1;
  assert.ok(sales >= 3 && sales <= 5, `${sales} sale pages loaded`);   // pages already in flight in the other workers finish
  assert.ok(opened.every(t => t.closed));
});

test('timeouts on an unknown page count too', async () => {
  const { run } = runWith(url => (isSale(url) ? { ...ok('https://example.test/'), sale: null } : listPage(url)));
  await assert.rejects(run(), e => e.constructor.name === 'Blocked');
});

test('a sale page that loads between timeouts resets the count', async () => {
  const bad = new Set([IDS[0], IDS[1], IDS[7], IDS[8]]);
  const { run } = runWith(url => (!isSale(url) ? listPage(url) : bad.has(url.split('/').pop()) ? challenge(url) : ok(url)));
  const out = await run();
  assert.equal(out.length, IDS.length);
  assert.equal(out.filter(x => x.error).length, 4);
});

test('a Too Many Requests page stops the run at once', async () => {
  const { run, opened } = runWith(url => (isSale(url) ? { ...ok(url), limited: true, sale: null } : listPage(url)));
  await assert.rejects(run(), e => e.constructor.name === 'Blocked' && /Too Many Requests/.test(e.message));
  assert.ok(opened.reduce((n, t) => n + t.navigations, 0) - 1 <= 3);
});

test('a block page stops the run at once', async () => {
  const { run } = runWith(url => (isSale(url) ? { ...ok(url), block: true, sale: null } : listPage(url)));
  await assert.rejects(run(), e => e.constructor.name === 'Blocked');
});
