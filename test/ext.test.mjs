import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const permissions = { contains: async () => false, request: async () => false };

test('an extension page gets the real permissions API', async () => {
  globalThis.chrome = { runtime: {}, storage: {}, tabs: {}, permissions };
  const { ext } = await import('../extension/lib/ext.js?page');
  assert.equal(ext.permissions, permissions);
  assert.equal(await ext.permissions.contains({ origins: ['https://x/*'] }), false);
});

test('a content script does not get a permissions API that always says yes', async () => {
  globalThis.chrome = { runtime: {}, storage: {}, permissions };
  const { ext } = await import('../extension/lib/ext.js?content');
  assert.equal(ext.permissions, undefined);
});

test('hasOrigins asks the real API on a page and the background script from a content script', async () => {
  const asked = [];
  globalThis.chrome = { runtime: {}, storage: {}, tabs: {}, permissions: { contains: async o => { asked.push(o); return true; } } };
  const page = await import('../extension/lib/ext.js?page-origins');
  assert.equal(await page.hasOrigins(['https://x/*']), true);
  assert.deepEqual(asked, [{ origins: ['https://x/*'] }]);
  const sent = [];
  globalThis.chrome = { runtime: { sendMessage: async m => { sent.push(m); return { ok: true, v: false }; } }, storage: {}, permissions };
  const content = await import('../extension/lib/ext.js?content-origins');
  assert.equal(await content.hasOrigins(['https://y/*']), false);
  assert.deepEqual(sent, [{ cml: 'rpc', op: 'permissions.contains', args: [['https://y/*']] }]);
  // the background script allows that call (it answers "not allowed" to any op missing from its list)
  assert.match(fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8'), /^\s*'permissions\.contains':/m);
});
