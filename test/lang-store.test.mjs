import test from 'node:test';
import assert from 'node:assert/strict';

const data = {};
globalThis.chrome ??= { tabs: {}, runtime: {} };
chrome.storage = { local: {
  set: async o => { Object.assign(data, o); },
  get: async k => ({ [k]: data[k] }),
} };
const { langFromPath } = await import('../extension/lib/locale.js');
const { getLang, saveLang } = await import('../extension/lib/store.js');

test('langFromPath reads the language of a Cardmarket path, null for others', () => {
  assert.equal(langFromPath('/de/Magic/Orders/1'), 'de');
  assert.equal(langFromPath('/EN/Magic'), 'en');
  assert.equal(langFromPath('/fr/Magic'), null);
  assert.equal(langFromPath('/'), null);
});

test('getLang defaults to English and returns the saved language', async () => {
  assert.equal(await getLang(), 'en');
  await saveLang('de');
  assert.equal(data.cmLang, 'de');
  assert.equal(await getLang(), 'de');
});
