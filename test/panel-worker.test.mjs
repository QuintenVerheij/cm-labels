import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const updates = [];
globalThis.chrome = {
  tabs: {
    async create({ url }) { updates.push(url); return { id: 5 }; },
    async update(id, { url }) { updates.push(url); return {}; },
    async get() { return { status: 'loading' }; },
    async group() { return 1; },
  },
  tabGroups: { update: async () => {} },
};
const { Tab } = await import('../extension/lib/tabs.js');

test('a worker tab loads every URL with the worker marker', async () => {
  updates.length = 0;
  const tab = await Tab.open('about:blank', { file: 'f', ns: 'n', hash: '#cml-worker' });
  await tab.navigate('https://www.cardmarket.com/en/Magic/Orders/1000000001');
  assert.deepEqual(updates, ['about:blank', 'https://www.cardmarket.com/en/Magic/Orders/1000000001#cml-worker']);
});

test('a tab without a marker loads URLs unchanged', async () => {
  updates.length = 0;
  const tab = await Tab.open('https://x/', { file: 'f', ns: 'n' });
  await tab.navigate('https://x/y');
  assert.deepEqual(updates, ['https://x/', 'https://x/y']);
});

const source = readFileSync(new URL('../extension/content/panel.js', import.meta.url), 'utf8');
function runPanel(hash) {
  let imported = false;
  const ctx = {
    window: {}, location: { pathname: '/en/Magic/Orders/1000000001', hash },
    chrome: { runtime: { getURL: u => u } },
    __cmlCM: { state: () => ({ loggedIn: true }) },
    loadModule: () => { imported = true; return Promise.resolve({ start() {} }); },
    console,
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(source.replaceAll('import(', 'loadModule('), ctx);
  return imported;
}

test('the panel does not start in a worker tab', () => {
  assert.equal(runPanel('#cml-worker'), false);
});

test('the panel starts in an ordinary tab', () => {
  assert.equal(runPanel(''), true);
});
