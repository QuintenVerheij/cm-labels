import test from 'node:test';
import assert from 'node:assert/strict';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const calls = [];
let onTest = () => false;
globalThis.chrome = {
  tabs: {},
  scripting: {
    async executeScript({ args: [, name] }) {
      calls.push(name);
      if (name === 'click') return [{ result: { ok: true, v: true } }];
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
