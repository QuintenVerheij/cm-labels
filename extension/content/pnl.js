// Injected into a jouw.postnl.nl tab (isolated world). Finds elements from small "spec" objects, tests
// conditions given as data ({all:[...]}, {checked: spec}, ...), clicks, fills fields and reads the cart.
// The waiting and retrying happens in the app page (lib/postnl.js).
(() => {
  if (window.__cmlPNL) return;
  const IT = e => (e ? (e.innerText || '').trim() : '');
  const lbl = i => i && (i.closest('label') || i.parentElement);
  const byText = t => [...document.querySelectorAll('button,a')].find(b => (b.getAttribute('aria-label') || b.innerText || '').trim() === t);
  const byLabel = l => {
    const m = [...document.querySelectorAll('input,textarea')].filter(e => e.labels && e.labels[0] && e.labels[0].innerText.trim().startsWith(l));
    if (m.length !== 1) throw new Error(`${m.length} fields with a label starting "${l}", expected 1`);
    return m[0];
  };
  const countryOptions = () => [...document.querySelectorAll('[role=dialog] span,dialog span,.cdk-overlay-pane span')]
    .filter(e => !e.children.length && e.innerText.trim() && !/resultaten gevonden|Gefilterd/.test(e.innerText));
  // PostNL's cookie wall (a web component with a shadow root, sometimes plain page buttons) blocks the tab until
  // answered, and it can come at any moment. Answer "only needed cookies"; only a visible button counts.
  const REFUSE = ['Alles weigeren', 'Weigeren', 'Alleen noodzakelijke cookies', 'Alleen noodzakelijk'];
  const visible = b => b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden';
  const cookieBtn = () => {
    const roots = [document, ...[...document.querySelectorAll('pnl-cookie-wall-widget, [id*=cookie] , [class*=cookie]')].map(e => e.shadowRoot).filter(Boolean)];
    for (const r of roots) {
      const b = [...r.querySelectorAll('button')].find(b => REFUSE.includes(b.textContent.replace(/\s+/g, ' ').trim()) && visible(b));
      if (b) return b;
    }
    return null;
  };
  // A click is refused on the payment page and on any button or link whose text speaks of paying or ordering.
  const NEVER_CLICK = /betal|bestel|afrekenen|pay|order/i;
  // Only buttons and links are read by text; an address suggestion or a country is the customer's own text ("Norderstedt").
  const TEXT_CHECKED = new Set(['btn', 'sel', 'manualBtn', 'extraBtn']);
  const suggestionSel = '.pnl-address-suggestion-item';

  function find(s) {
    switch (s.k) {
      case 'sel': return document.querySelector(s.v);
      case 'btn': return byText(s.v);
      case 'value': return document.querySelector(`input[value="${s.v}"]`);
      case 'radio': return document.querySelectorAll(`input[name="${s.name}"]`)[s.i];
      case 'label': return byLabel(s.v);
      case 'cookie': return cookieBtn();
      case 'country': { const o = countryOptions(); return o.find(e => e.innerText.trim() === s.v) || (o.length === 1 ? o[0] : null); }
      case 'sugg': return document.querySelectorAll(suggestionSel)[s.i];
      case 'manualBtn': return [...document.querySelectorAll('button')].find(b => /losse adresvelden|zelf invullen zonder controle/.test(b.textContent));
      case 'extraBtn': return [...document.querySelectorAll('button,a')].find(e => /extra adresgegevens/.test(e.textContent));
      default: throw new Error(`unknown spec ${JSON.stringify(s)}`);
    }
  }

  const Q = {
    path: () => location.pathname,
    dest: () => (document.body.innerText.split('Wat is de bestemming?')[1] || '').split('Ander land')[0].trim(),
    qty: () => (document.querySelector('.stepper-number-input') || {}).value,
    total: () => (document.body.innerText.split('Totaalbedrag (incl. btw):').pop() || '').split(/Nog iets|Onthouden/)[0].replace(/\s+/g, ''),
    radioTexts: name => [...document.querySelectorAll(`input[name="${name}"]`)].map(i => IT(lbl(i)).split('\n')[0].trim()),
    bands: () => [...document.querySelectorAll('input[name=weight]')].map(i => IT(lbl(i)).replace(/\s+/g, ' ')),
    checkedValues: () => [...document.querySelectorAll('input[type=radio]:checked')].map(r => r.value),
    countryNames: () => countryOptions().map(e => e.innerText.trim()),
    suggestions: () => [...document.querySelectorAll(suggestionSel)].map(b => b.innerText.replace(/\s+/g, ' ').trim()),
    successLines: () => IT(document.querySelector('.stamp-alert--success')).split('\n').map(x => x.trim()).filter(Boolean),
    suffixOptions: () => [...(document.querySelector('select[formcontrolname=houseNumberSuffix]')?.options || [])].map(o => o.text.trim()),
    emailRequired: () => !(document.querySelector('input[name=emailAddress]')?.labels?.[0]?.innerText || 'niet verplicht').includes('niet verplicht'),
    cartLines: () => (document.body.innerText.match(/Verwijderen/g) || []).length,
    // Invalid controls and visible error texts; a role=alert box counts unless it is information (the green NL
    // address box, "Het adres wordt niet meer gecheckt").
    errors: () => [...document.querySelectorAll('input.ng-invalid,textarea.ng-invalid,select.ng-invalid')].map(e => 'invalid:' + (e.name || e.getAttribute('formcontrolname')))
      .concat([...document.querySelectorAll('.stamp-form-field-error__text,[class*=field-error],[role=alert]')]
        .filter(e => e.offsetParent !== null && !e.querySelector('.stamp-alert--success,.stamp-alert--information')).map(e => e.innerText.trim()).filter(Boolean))
      .filter((x, i, a) => a.indexOf(x) === i).join(' / '),
    order: () => sessionStorage.getItem('current-order'),
  };

  // Conditions as data, so no code strings are needed (Manifest V3 forbids eval).
  function test(c) {
    if (c.all) return c.all.every(test);
    if (c.any) return c.any.some(test);
    if (c.not) return !test(c.not);
    if (c.exists) return !!find(c.exists);
    if (c.checked) return !!find(c.checked)?.checked;
    if (c.path) return location.pathname.endsWith(c.path);
    if (c.text) return document.readyState === 'complete' && document.body.innerText.includes(c.text);
    if (c.q) { const v = Q[c.q](...(c.args || [])); return c.nonEmpty ? (v.length > 0 && v.every(Boolean)) : v === c.eq; }
    if (c.suffixCount) return (document.querySelector('select[formcontrolname=houseNumberSuffix]')?.options.length || 0) > c.suffixCount;
    if (c.suffixIndex !== undefined) return document.querySelector('select[formcontrolname=houseNumberSuffix]')?.selectedIndex === c.suffixIndex;
    throw new Error(`unknown condition ${JSON.stringify(c)}`);
  }

  // Native value setter + the events Angular's form controls listen to (input) and mark "touched" on (blur).
  function fill(spec, text) {
    const e = find(spec);
    if (!e) return null;
    e.scrollIntoView({ block: 'center' });
    e.focus();
    let proto = Object.getPrototypeOf(e), desc;
    while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, 'value'))) proto = Object.getPrototypeOf(proto);
    if (!desc?.set) throw new Error('field has no value setter');
    desc.set.call(e, text);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    e.dispatchEvent(new FocusEvent('blur'));
    e.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    e.blur();
    return e.value;
  }

  window.__cmlPNL = {
    q: (name, ...args) => Q[name](...args),
    test,
    exists: spec => !!find(spec),
    click: spec => {
      if (location.pathname.endsWith('/betalen')) return false;
      const e = find(spec);
      if (!e) return false;
      if (TEXT_CHECKED.has(spec.k) && NEVER_CLICK.test(e.getAttribute('aria-label') || e.innerText || e.textContent || '')) return false;
      e.click();
      return true;
    },
    cookie: () => { const b = cookieBtn(); if (!b) return false; b.click(); return true; },
    fill,
    setSuffix: i => { const s = document.querySelector('select[formcontrolname=houseNumberSuffix]'); s.selectedIndex = i; s.dispatchEvent(new Event('change', { bubbles: true })); s.dispatchEvent(new FocusEvent('blur')); return s.selectedIndex; },
    // Cart merge: append other tabs' entities (NgRx entity state) with the next numeric ids, last one active.
    mergeOrders: others => {
      const parse = (raw, what) => {
        let o = null;
        try { o = JSON.parse(raw); } catch { }
        if (!o || typeof o !== 'object' || !o.entities || !Array.isArray(o.ids)) throw new Error(`${what} has no valid PostNL cart (current-order)`);
        return o;
      };
      const a = parse(sessionStorage.getItem('current-order'), 'the cart tab');
      const bs = others.map((s, i) => parse(s, `tab ${i + 2}`));
      let n = Math.max(-1, ...Object.values(a.entities).map(e => e.id)) + 1;
      for (const b of bs) { for (const e of Object.values(b.entities)) { a.entities[String(n)] = { ...e, id: n }; a.ids.push(n); n++; } }
      a.ids = a.ids.map(Number); a.activeIds = [a.ids[a.ids.length - 1]];
      sessionStorage.setItem('current-order', JSON.stringify(a));
      return a.ids.length;
    },
  };
})();
