import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.chrome ??= { tabs: {} };
const { baseFromPath, isReadablePath } = await import('../extension/lib/cardmarket.js');

test('baseFromPath keeps the language and game of the path', () => {
  assert.equal(baseFromPath('/en/Magic/Orders/Sales/Paid'), 'https://www.cardmarket.com/en/Magic');
  assert.equal(baseFromPath('/de/Magic/Orders/1234567890'), 'https://www.cardmarket.com/de/Magic');
  assert.equal(baseFromPath('/en/Pokemon/Orders/Sales/Paid'), 'https://www.cardmarket.com/en/Pokemon');
  assert.equal(baseFromPath('/'), null);
});

test('only the English Magic pages are readable', () => {
  assert.equal(isReadablePath('/en/Magic/Orders/Sales/Paid'), true);
  assert.equal(isReadablePath('/de/Magic/Orders/Sales/Paid'), false);
  assert.equal(isReadablePath('/en/Pokemon/Orders/Sales/Paid'), false);
});
