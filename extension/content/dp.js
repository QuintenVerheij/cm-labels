// Injected into a shop.deutschepost.de tab (isolated world). The selectors and texts of the shop's pages are not
// here: they come from the SHOP table in lib/deutschepost.js as specs ({ sel, text?, label?, input?, what }).
// This file finds, tests, fills, clicks and reads the cart lines. Every action needs exactly one element: a page
// that shows none or several fails with the count, so a changed page never gets a field filled by guess.
(() => {
  if (window.__cmlDP) return;
  const T = e => String(e ? (e.innerText ?? e.textContent ?? '') : '').replace(/\s+/g, ' ').trim();
  // Never pays: a click is refused on the cart and every checkout step after it, and on any element whose text
  // or label speaks of paying, ordering or buying. The cart is left for the user.
  const NEVER_PATH = /\/(checkout|warenkorb|kasse|bezahl|zahlung)/i;
  const NEVER_TEXT = /bezahl|zahlung|kasse|\bkauf|bestell|checkout|pay|order/i;
  const refused = e => NEVER_PATH.test(location.pathname) || NEVER_TEXT.test(`${e.getAttribute?.('aria-label') || ''} ${T(e)}`);

  // All elements of a spec: the selector, then only those with this exact text or aria-label (text), whose label
  // starts with label, and, for input, the element when it is an input, else the one input inside it.
  function all(s) {
    let m = [...document.querySelectorAll(s.sel)];
    if (s.text != null) m = m.filter(e => T(e) === s.text || e.getAttribute?.('aria-label') === s.text);
    if (s.label != null) m = m.filter(e => T(e.labels?.[0]).startsWith(s.label));
    if (s.input) m = [...new Set(m.flatMap(e => (e.tagName === 'INPUT' ? [e] : [...e.querySelectorAll('input')])))];
    return m;
  }
  // The one element of a spec; null when there is none (a page still loading), an error when there are several.
  function one(s) {
    const m = all(s);
    if (m.length > 1) throw new Error(`${m.length} elements for ${s.what || s.sel}, expected 1`);
    return m[0] || null;
  }
  const need = s => { const e = one(s); if (!e) throw new Error(`no ${s.what || s.sel} on the page`); return e; };

  // A cart line: from its delete button up to the first element with a heading (the line's title), never up to
  // one that holds another line's delete button.
  const H = 'h1,h2,h3,h4,h5,h6';
  function lines(del) {
    const dels = all(del);
    return dels.map(b => {
      let c = b;
      while (!c.querySelector(H) && c.parentElement && dels.filter(x => c.parentElement.contains(x)).length === 1) c = c.parentElement;
      return { title: T(c.querySelector(H)), text: T(c) };
    });
  }

  const Q = {
    page: () => ({ path: location.pathname, title: document.title }),
    count: s => all(s).length,
    text: s => { const e = need(s); return String(e.innerText ?? e.textContent ?? ''); },
    value: s => need(s).value,
    lines,
  };

  // Conditions as data, so no code strings are needed (Manifest V3 forbids eval).
  function test(c) {
    if (c.all) return c.all.every(test);
    if (c.any) return c.any.some(test);
    if (c.not) return !test(c.not);
    if (c.exists) return all(c.exists).length > 0;
    if (c.count) return all(c.count).length >= c.min;
    if (c.path) return location.pathname.startsWith(c.path);
    throw new Error(`unknown condition ${JSON.stringify(c)}`);
  }

  // Native value setter + the events React listens to (input, change) and blur, which commits a number field.
  function fill(s, text) {
    const e = one(s);
    if (!e) return null;
    if (!['INPUT', 'TEXTAREA'].includes(e.tagName) || e.type === 'hidden' || e.readOnly || e.disabled) throw new Error(`${s.what || s.sel} is not a field to type in (${e.tagName})`);
    e.scrollIntoView?.({ block: 'center' });
    e.focus?.();
    let proto = Object.getPrototypeOf(e), desc;
    while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, 'value'))) proto = Object.getPrototypeOf(proto);
    if (!desc?.set) throw new Error('field has no value setter');
    desc.set.call(e, text);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    e.dispatchEvent(new FocusEvent('blur'));
    e.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    e.blur?.();
    return e.value;
  }

  window.__cmlDP = {
    q: (name, ...args) => Q[name](...args),
    test,
    exists: s => all(s).length > 0,
    // true when clicked; false when refused or not there yet; an error for several matches or a disabled button.
    click: s => {
      const e = one(s);
      if (!e || refused(e)) return false;
      if (e.disabled || e.getAttribute?.('aria-disabled') === 'true') throw new Error(`${s.what || s.sel} is disabled`);
      e.click();
      return true;
    },
    // The cookie banner's refuse button, when it shows: answered on any page, never a button that could pay.
    cookie: s => {
      const e = all(s).find(b => b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden');
      if (!e || NEVER_TEXT.test(T(e))) return false;
      e.click();
      return true;
    },
    fill,
  };
})();
