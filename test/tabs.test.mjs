import test from 'node:test';
import assert from 'node:assert/strict';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const calls = [];
let onTest = () => false;
let pageErrors = '';
globalThis.chrome = {
  tabs: {},
  scripting: {
    async executeScript({ args: [, name] }) {
      calls.push(name);
      if (name === 'click') return [{ result: { ok: true, v: true } }];
      if (name === 'q') return [{ result: { ok: true, v: pageErrors } }];
      return [{ result: { ok: true, v: await onTest() } }];
    },
  },
};
const { Tab } = await import('../extension/lib/tabs.js');

test('clickUntil does not click again when the last click already worked by the time the wait ended', async () => {
  calls.length = 0;
  let tests = 0;
  // The first test inside the wait is slow and false, which uses up the 1 s window; the next test is true.
  onTest = async () => {
    tests++;
    if (tests === 2) { await sleep(1100); return false; }
    return tests > 2;
  };
  const tab = new Tab(1, 'content/pnl.js', '__cmlPNL');
  await tab.clickUntil({ k: 'btn', v: 'Verder' }, { path: '/x' }, { tries: 3 });
  assert.equal(calls.filter(c => c === 'click').length, 1);
});

test('clickUntil does not click at all when the condition already holds', async () => {
  calls.length = 0;
  onTest = () => true;
  const tab = new Tab(1, 'content/pnl.js', '__cmlPNL');
  await tab.clickUntil({ k: 'btn', v: 'Verder' }, { path: '/x' }, { tries: 3 });
  assert.equal(calls.filter(c => c === 'click').length, 0);
});

test('waitFor names the error the tab call failed with', async () => {
  onTest = () => { throw new Error('Cannot access contents of the page'); };
  const tab = new Tab(1, 'content/pnl.js', '__cmlPNL');
  await assert.rejects(tab.waitFor({ path: '/x' }, 200, 'the page'), /timeout waiting for the page: .*Cannot access contents of the page/);
});

test('clickUntil names the last error and the errors on the page', async () => {
  onTest = () => { throw new Error('tab was closed'); };
  pageErrors = 'invalid:zip';
  const tab = new Tab(1, 'content/pnl.js', '__cmlPNL');
  await assert.rejects(tab.clickUntil({ k: 'btn', v: 'Verder' }, { path: '/x' }, { tries: 1 }), /no effect after 1 clicks.*invalid:zip.*tab was closed/);
  pageErrors = '';
});

test('parallel Tab.open calls create one tab group', async () => {
  let created = 0, joined = 0, id = 100;
  chrome.tabs.create = async () => ({ id: ++id });
  chrome.tabs.group = async ({ groupId }) => { await sleep(20); if (groupId === undefined) { created++; return 7; } joined++; return groupId; };
  chrome.tabGroups = { update: async () => {} };
  await Promise.all([1, 2, 3].map(() => Tab.open('https://x', { file: 'f', ns: 'n' })));
  assert.equal(created, 1);
  assert.equal(joined, 2);
});
