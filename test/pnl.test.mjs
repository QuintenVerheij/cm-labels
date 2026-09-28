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

test('click presses an address suggestion whose text contains a deny-listed word', () => {
  location.pathname = '/nl/verzenden'; clicked = 0;
  const q = document.querySelectorAll;
  document.querySelectorAll = () => [button('Norderstraße 5, Norderstedt'), button('Rue du Paysan')];
  try {
    assert.equal(window.__cmlPNL.click({ k: 'sugg', i: 0 }), true);
    assert.equal(window.__cmlPNL.click({ k: 'sugg', i: 1 }), true);
    assert.equal(clicked, 2);
    element = button('Betalen');
    assert.equal(window.__cmlPNL.click({ k: 'sel', v: 'button' }), false);
    assert.equal(clicked, 2);
    location.pathname = '/nl/verzenden/betalen';
    assert.equal(window.__cmlPNL.click({ k: 'sugg', i: 0 }), false);
    assert.equal(clicked, 2);
  } finally { document.querySelectorAll = q; location.pathname = '/nl/verzenden'; }
});

const field = (label, proto = Object.prototype) => ({ labels: [{ innerText: label }], __proto__: proto });
const withFields = (fields, fn) => { const q = document.querySelectorAll; document.querySelectorAll = sel => (sel === 'input,textarea' ? fields : []); try { return fn(); } finally { document.querySelectorAll = q; } };
const byLabel = () => window.__cmlPNL.exists({ k: 'label', v: 'Straat' });

test('a label spec throws when no field or several fields match', () => {
  withFields([field('Postcode')], () => assert.throws(byLabel, /0 fields/));
  withFields([field('Straat'), field('Straatnaam')], () => assert.throws(byLabel, /2 fields/));
  withFields([field('Straat'), field('Postcode')], () => assert.equal(byLabel(), true));
});

test('fill finds the value setter further up the prototype chain', () => {
  const base = { set value(v) { this._v = v; }, get value() { return this._v; } };
  const input = Object.assign(Object.create(Object.create(base)), { labels: [{ innerText: 'Straat' }], scrollIntoView() {}, focus() {}, blur() {}, dispatchEvent() {} });
  globalThis.Event = class {}; globalThis.FocusEvent = class {};
  withFields([input], () => assert.equal(window.__cmlPNL.fill({ k: 'label', v: 'Straat' }, 'Dorpsstraat'), 'Dorpsstraat'));
});
