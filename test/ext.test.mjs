import test from 'node:test';
import assert from 'node:assert/strict';

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
