import test from 'node:test';
import assert from 'node:assert/strict';

let clicked = 0;
const button = text => ({ innerText: text, textContent: text, getAttribute: () => null, click: () => { clicked++; } });
let element = null;
globalThis.window = globalThis;
globalThis.location = { pathname: '/nl/verzenden' };
globalThis.document = { querySelector: () => element, querySelectorAll: () => [] };
await import('../extension/content/pnl.js');
const spec = { k: 'sel', v: 'button' };
const click = () => window.__cmlPNL.click(spec);

test('click presses an ordinary button', () => {
  clicked = 0; element = button('Verder'); location.pathname = '/nl/verzenden';
  assert.equal(click(), true);
  assert.equal(clicked, 1);
});

test('click refuses on the payment page', () => {
  clicked = 0; element = button('Verder'); location.pathname = '/nl/verzenden/betalen';
  assert.equal(click(), false);
  assert.equal(clicked, 0);
});

test('click refuses an element whose text speaks of paying or ordering', () => {
  location.pathname = '/nl/verzenden';
  for (const text of ['Nu betalen', 'Bestelling plaatsen', 'Afrekenen', 'Pay now', 'Place ORDER']) {
    clicked = 0; element = button(text);
    assert.equal(click(), false, text);
    assert.equal(clicked, 0, text);
  }
});
