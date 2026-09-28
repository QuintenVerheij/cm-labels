import test from 'node:test';
import assert from 'node:assert/strict';

let tabExists = true;
globalThis.chrome ??= { tabs: {}, runtime: {}, storage: {} };
chrome.tabs.get = async () => { if (!tabExists) throw new Error('No tab with id: 1'); return {}; };
const { loadSales } = await import('../extension/lib/cardmarket.js');
const { Tab } = await import('../extension/lib/tabs.js');

const ID = '1000000001';
const page = (url, over = {}) => ({ ready: 'complete', check: false, block: false, limited: false, loggedIn: true, url, sale: url.split('/').pop(), ...over });

// pageFor(url, tab) is the state of the page the tab shows after navigating to url.
function runWith(pageFor, opts = {}) {
  const opened = [], openOpts = [];
  Tab.open = async (url, o) => {
    openOpts.push(o);
    const tab = {
      id: 1, url: '', closed: false, navigations: 0,
      async navigate(url) { this.url = url; this.navigations++; },
      async safe(name, fallback, id) {
        if (name === 'state') return pageFor(this.url, this);
        if (name === 'hasSale') return pageFor(this.url, this).sale === id;
        return fallback;
      },
      async call(name, id) { return name === 'list' ? { ids: [ID], pages: 1 } : { id, lines: [] }; },
      async activate() {}, async close() { this.closed = true; },
    };
    opened.push(tab);
    return tab;
  };
  const logins = [];
  const run = () => loadSales('Paid', { log() {}, onLogin: on => logins.push(on), saleMs: 200, loginPollMs: 10, ...opts });
  return { run, opened, logins, openOpts };
}

const loggedOut = url => page(url, { loggedIn: false, sale: null });

test('the login wait ends with an error after its deadline', async () => {
  tabExists = true;
  const { run, logins } = runWith(url => loggedOut(url), { loginMs: 100 });
  await assert.rejects(run(), /Not logged in to Cardmarket within/);
  assert.deepEqual(logins, [true, false]);
});

test('the login wait ends at once when the tab is gone', async () => {
  const { run, opened, logins } = runWith(url => loggedOut(url), { loginMs: 60000 });
  tabExists = true;
  const started = Date.now();
  const stop = setTimeout(() => { tabExists = false; }, 50);
  await assert.rejects(run(), /tab was closed/);
  clearTimeout(stop);
  assert.ok(Date.now() - started < 5000);
  assert.deepEqual(logins, [true, false]);
  assert.ok(opened.every(t => t.closed));
  tabExists = true;
});

test('a logged-out page at another URL is seen as logged out, not as a timeout', async () => {
  tabExists = true;
  let polls = 0;
  const { run, logins } = runWith(url => {
    if (!url.includes('/Orders/Sales')) return page(url);
    if (polls++ < 3) return page('https://www.cardmarket.com/en/Magic/Login?referrer=x', { loggedIn: false, sale: null });
    return page(url, { sale: null });
  }, { loginMs: 5000 });
  const out = await run();
  assert.equal(out.length, 1);
  assert.ok(polls >= 3);
  assert.deepEqual(logins, [true, false]);
});

test('a loaded page with no sale reports not your sale, well before the page deadline', async () => {
  tabExists = true;
  const { run } = runWith(url => page(url, { sale: null }),{ saleMs: 4000 });
  const started = Date.now();
  const out = await run();
  assert.match(out[0].error, /not your sale or no such order/);
  assert.ok(Date.now() - started < 3500);
});

test('the list tab and every worker tab open with the worker hash', async () => {
  tabExists = true;
  const { run, openOpts } = runWith(url => page(url), { only: [ID, '1000000002', '1000000003'] });
  await run();
  assert.equal(openOpts.length, 3);
  for (const o of openOpts) assert.equal(o.hash, '#cml-worker');
});

// A tab that records the URLs it navigates to; the list page reports listPages.
function recordingTabs(listPages) {
  const urls = [];
  Tab.open = async () => ({
    id: 1, url: '',
    async navigate(url) { this.url = url; urls.push(url); },
    async activate() {}, async close() {},
    async safe(name, fb) { return name === 'state' ? page(this.url) : name === 'hasSale' ? true : fb; },
    async call(name, id) { return name === 'list' ? { ids: [ID], pages: listPages } : { id, lines: [] }; },
  });
  return urls;
}

test('a German run requests /de/Magic/ URLs', async () => {
  const urls = recordingTabs(1);
  const out = await loadSales('Paid', { lang: 'de', log() {}, onLogin() {}, saleMs: 200 });
  assert.equal(out.length, 1);
  assert.equal(urls.length, 2);
  assert.ok(urls.every(u => u.startsWith('https://www.cardmarket.com/de/Magic/')), urls.join(', '));
});

test('a list page count that could not be read logs a warning and loads page 1 only', async () => {
  const urls = recordingTabs(null);
  const logs = [];
  const out = await loadSales('Paid', { log: m => logs.push(m), onLogin() {}, saleMs: 200 });
  assert.equal(out.length, 1);
  assert.ok(logs.some(m => /page count could not be read/.test(m)), logs.join(', '));
  assert.ok(urls.every(u => !u.includes('site=')));
});
