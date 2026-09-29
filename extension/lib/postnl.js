// PostNL: every cart item (a stamp group or a tracked label) is filled in its own hidden tab, in parallel.
// PostNL keeps the cart per tab (sessionStorage 'current-order', an NgRx entity state), so at the end the items
// are merged into one tab's cart, in the shape of a cart built by hand. That tab comes to the front on the
// cart page: check it and pay there. Nothing here pays.
import { ext } from './ext.js';
import { Tab, sleep } from './tabs.js';
import { Norm, SuffixKey } from './plan.js';

export const NAME = 'PostNL';
export const ORIGINS = ['https://jouw.postnl.nl/*'];
export const BRACKETS = [20, 50];   // Brief of kaart: the two weights of a postzegelcode (weight-0, weight-1)
export const START = 'https://jouw.postnl.nl/online-versturen/nl-NL/pakket/kiezen';
const S = {
  sel: v => ({ k: 'sel', v }), btn: v => ({ k: 'btn', v }), val: v => ({ k: 'value', v }), radio: (name, i) => ({ k: 'radio', name, i }),
  label: v => ({ k: 'label', v }), country: v => ({ k: 'country', v }), sugg: i => ({ k: 'sugg', i }),
  cookie: { k: 'cookie' }, manualBtn: { k: 'manualBtn' }, extraBtn: { k: 'extraBtn' },
};
const SUCCESS = S.sel('.stamp-alert--success');
const euro = s => { const m = String(s).replace(/\s/g, '').match(/([\d.]+),(\d{2})/); return m ? +(m[1].replace(/\./g, '') + '.' + m[2]) : null; };
const same = (a, b) => String(a ?? '').replace(/\s+/g, ' ').trim() === String(b ?? '').replace(/\s+/g, ' ').trim();

function pick(texts, want, what) {
  let k = texts.indexOf(want);
  if (k < 0) { const hits = texts.map((t, i) => [t, i]).filter(([t]) => t.startsWith(want)); if (hits.length === 1) k = hits[0][1]; }
  if (k < 0) throw new Error(`PostNL has no ${what} '${want}'. On the page: ${texts.join(', ')}`);
  return k;
}
async function fill(tab, spec, text, what) {
  if (!text) return;
  let v = null;
  for (let i = 0; i < 3; i++) {
    v = await tab.safe('fill', null, spec, text);
    if (same(v, text)) return;
    await sleep(400);
  }
  throw new Error(v == null ? `field ${what} not found` : `field ${what} holds '${v}', expected '${text}'`);
}
// PostNL's cookie wall blocks the tab until answered and can pop up at any moment: every wait and click loop
// of a PostNL tab checks for it (Tab.onPoll) and answers "only needed cookies". cookieWall() also checks at
// the fixed steps of the flow.
async function cookieWall(tab, log) {
  const wall = await tab.safe('cookie', false);
  if (wall) log?.('PostNL cookie wall answered: only needed cookies');
  return !!wall;
}
// step(): one progress step done (see STEPS)
async function setCountry(tab, country, log, step) {
  await tab.waitFor({ exists: S.sel('input[name=package]') }, 20000, 'PostNL /kiezen');
  await cookieWall(tab, log);
  step();   // page
  if ((await tab.call('q', 'dest')) === country) return step();
  await tab.clickUntil(S.btn('Ander land kiezen'), { exists: S.sel('input[placeholder^=Zoek]') }, { what: 'Ander land kiezen' });
  await fill(tab, S.sel('input[placeholder^=Zoek]'), country, 'country search');
  await tab.waitFor({ all: [{ q: 'countryNames', nonEmpty: true }, { text: 'resultaten gevonden' }] }, 10000, `country list for ${country}`);
  const names = await tab.call('q', 'countryNames');
  const name = names.includes(country) ? country : names.length === 1 ? names[0] : null;
  if (!name) throw new Error(`PostNL has no single match for '${country}': ${names.join(', ')}`);
  await tab.clickUntil(S.country(name), { q: 'dest', eq: name }, { what: `country ${name}` });
  // after a country change PostNL draws the product cards again: wait until they have their names
  await tab.waitFor({ q: 'radioTexts', args: ['package'], nonEmpty: true }, 10000, 'product cards');
  step();   // country
}
async function toCart(tab) {
  await tab.clickUntil(S.btn('Verder'), { any: [{ path: '/betalen' }, { path: '/douane' }] }, { what: 'Verder (to the cart)' });
  if ((await tab.call('q', 'path')).endsWith('/douane')) throw new Error('PostNL asks for customs (Douane); EU only');
  await tab.waitFor({ text: 'Totaalbedrag' }, 20000, 'cart page');
}

// Stamp group: Brief of kaart, 20 or 50 g, postzegelcode, quantity.
async function stampFlow(tab, g, log, step) {
  await setCountry(tab, g.country, log, step);
  const w = g.weight === 20 ? 'weight-0' : 'weight-1';
  await tab.clickUntil(S.val('package-0'), { all: [{ checked: S.val('package-0') }, { exists: S.val(w) }] }, { what: 'Brief of kaart' });
  step();
  await tab.clickUntil(S.val(w), { all: [{ checked: S.val(w) }, { checked: S.sel('input[name=senderOptions]') }, { checked: S.val('franking-option-0') }, { exists: S.sel('.stepper-number-input') }] }, { what: `${g.weight} g` });
  step();
  for (let cur = +(await tab.call('q', 'qty')); cur !== g.qty;) {
    const next = cur < g.qty ? cur + 1 : cur - 1;
    await tab.clickUntil(S.btn(cur < g.qty ? 'Meer' : 'Minder'), { q: 'qty', eq: String(next) }, { what: 'quantity' });
    cur = next;
  }
  step();   // quantity
  const checked = await tab.call('q', 'checkedValues');
  if (!['package-0', w, 'franking-option-0'].every(v => checked.includes(v)) || (await tab.call('q', 'qty')) !== String(g.qty)) throw new Error(`selection wrong before Verder: ${checked.join(',')}`);
  await toCart(tab);
  step();
  log(`${g.code} x${g.qty}: in its cart (${await tab.call('q', 'total')})`);
}

// Outside NL: PostNL's address check ("Suggesties" or "niet vinden"). One street line + one clear suggestion
// -> click it; extra lines, no or no clear suggestion -> the manual fields, as on Cardmarket.
async function setAddress(tab, p, log) {
  try { await tab.waitFor({ any: [{ exists: S.sel('.pnl-address-suggestion') }, { exists: S.manualBtn }] }, 8000); } catch { }
  let texts = [];
  if (await tab.safe('exists', false, S.sel('.pnl-address-suggestion'))) {
    await tab.waitFor({ q: 'suggestions', nonEmpty: true }, 5000);
    texts = await tab.call('q', 'suggestions');
  }
  let k = -1;
  if (texts.length) {
    const pc = Norm(p.Postcode), nrs = p.AddressLine.match(/\d+/g) || [];
    let fit = texts.map((t, i) => [t, i]).filter(([t]) => Norm(t).includes(pc) && nrs.some(n => new RegExp(`(?<!\\d)${n}(?!\\d)`).test(t))).map(([, i]) => i);
    if (fit.length > 1 && p.Manual) { const stem = Norm(p.Manual.Street).slice(0, 5); fit = fit.filter(i => stem && Norm(texts[i]).includes(stem)); }
    if (fit.length === 1) k = fit[0];
  }
  if (k >= 0 && !(p.Manual && p.Manual.Extra)) {
    log(`${p.Id}: suggestion ${texts[k]}`);
    await tab.clickUntil(S.sugg(k), { not: { exists: S.sel('.pnl-address-suggestion') } }, { what: 'address suggestion' });
    return false;
  }
  const why = p.Manual && p.Manual.Extra ? 'extra address lines' : texts.length ? `no clear suggestion (${texts.join(' | ')})` : 'PostNL did not find the address';
  if (!p.Manual) throw new Error(`${why}, and '${p.AddressLine}' has no street + house number to fill in by hand`);
  if (!(await tab.safe('exists', false, S.manualBtn))) throw new Error(`${why}, and PostNL shows no link for the manual address fields`);
  await tab.clickUntil(S.manualBtn, { exists: S.sel('input[name=streetName]') }, { what: 'manual address fields' });
  const m = p.Manual;
  await fill(tab, S.sel('input[name=streetName]'), m.Street, 'Straatnaam');
  await fill(tab, S.label('Huisnummer'), m.Nr, 'Huisnummer');
  await fill(tab, S.label('Toevoeging'), m.Ext, 'Toevoeging');
  if (Object.keys(m.Fields).length) {
    await tab.clickUntil(S.extraBtn, { exists: S.label('Gebouw') }, { what: 'extra address fields' });
    for (const [f, v] of Object.entries(m.Fields)) await fill(tab, S.label(f), v, f);
  }
  await fill(tab, S.sel('input[name=postalCode]'), p.Postcode, 'Postcode');
  await fill(tab, S.sel('input[name=town]'), p.Town, 'Plaats');
  log(`${p.Id}: manual address (${why}): ${m.Street} | ${m.Nr}${m.Ext ? ' ' + m.Ext : ''}${Object.entries(m.Fields).map(([f, v]) => ` | ${f}: ${v}`).join('')} - PostNL does not check it`);
  return true;
}

// Tracked label: product, weight band, option, recipient, address, phone/e-mail as on Cardmarket.
async function trackedFlow(tab, p, { fallbackEmail, log, step }) {
  await setCountry(tab, p.Country, log, step);
  let k = pick(await tab.call('q', 'radioTexts', 'package'), p.Product, 'product');
  await tab.clickUntil(S.radio('package', k), { all: [{ checked: S.radio('package', k) }, { exists: S.sel('input[name=senderOptions]') }] }, { what: p.Product });
  step();   // product
  const bands = await tab.call('q', 'bands');
  if (bands.length) {
    const max = l => { const m = l.match(/(\d+)\s*tot\s*(\d+)\s*(gram|kilo)/); return m ? +m[2] * (m[3] === 'kilo' ? 1000 : 1) : null; };
    const w = bands.map((b, i) => [max(b), i]).filter(([m]) => m != null && m >= p.Grams).sort((a, b) => a[0] - b[0])[0];
    if (!w) throw new Error(`no PostNL weight band holds ${p.Grams} g: ${bands.join(', ')}`);
    await tab.clickUntil(S.radio('weight', w[1]), { all: [{ checked: S.radio('weight', w[1]) }, { exists: S.sel('input[name=senderOptions]') }] }, { what: bands[w[1]] });
  }
  k = pick(await tab.call('q', 'radioTexts', 'senderOptions'), p.Option, 'option');
  await tab.clickUntil(S.radio('senderOptions', k), { checked: S.radio('senderOptions', k) }, { what: p.Option });
  step();   // weight band + option
  if ((await tab.call('q', 'qty')) !== '1') throw new Error(`quantity is ${await tab.call('q', 'qty')}, expected 1`);
  await tab.clickUntil(S.btn('Verder'), { all: [{ path: '/invullen' }, { exists: S.sel('input[name=firstName]') }] }, { what: 'Verder (to the address)' });
  await cookieWall(tab, log);
  step();   // address form

  if (!(await tab.safe('test', false, { checked: S.val('individual') }))) await tab.clickUntil(S.val('individual'), { checked: S.val('individual') }, { what: 'Persoon' });
  await fill(tab, S.sel('input[name=firstName]'), p.First, 'Voornaam');
  await fill(tab, S.sel('input[name=lastName]'), p.Last, 'Achternaam');
  step();   // name
  let manual = false;
  if (p.Iso === 'NL') {
    await fill(tab, S.sel('input[name=postalCode]'), p.Postcode, 'Postcode');
    await fill(tab, S.sel('input[name=houseNumber]'), p.Number, 'Huisnummer');
    // PostNL loads the Toevoeging options after postcode + number; the green address box comes when the
    // address is complete (after the suffix, when the address has one).
    try { await tab.waitFor({ any: [{ exists: SUCCESS }, { suffixCount: 1 }] }, 10000); } catch { throw new Error(`PostNL found no address for ${p.Postcode} ${p.Number}: ${await tab.call('q', 'errors')}`); }
    const all = await tab.call('q', 'suffixOptions');
    if (p.Suffix) {
      const i = all.map(SuffixKey).indexOf(p.SuffixKey);
      if (!p.SuffixKey || i < 1) throw new Error(`house number suffix '${p.Suffix}' is not in the PostNL list for ${p.Postcode} ${p.Number}: ${all.filter(Boolean).join(', ') || '(none)'}`);
      await tab.call('setSuffix', i);
      await tab.waitFor({ suffixIndex: i }, 3000, 'house number suffix');
      log(`${p.Id}: suffix '${p.Suffix}' -> '${all[i]}'`);
    } else if (!(await tab.safe('exists', false, SUCCESS)) && all.some(Boolean)) {
      throw new Error(`PostNL wants a house number suffix for ${p.Postcode} ${p.Number} (${all.filter(Boolean).join(', ')}); Cardmarket has none`);
    }
    try { await tab.waitFor({ exists: SUCCESS }, 10000); } catch { throw new Error(`PostNL shows no address for ${p.Postcode} ${p.Number} ${p.Suffix}: ${await tab.call('q', 'errors')}`); }
    const found = await tab.call('q', 'successLines');
    log(`${p.Id}: lookup ${found.join(' / ')}`);
    const sm = (found[0] || '').match(/^(.+?)\s+\d/);
    if (found.length < 2 || !sm || Norm(sm[1]) !== Norm(p.Street)) throw new Error(`PostNL street '${found[0]}' differs from Cardmarket '${p.Street} ${p.Number}${p.Suffix}'`);
    if (Norm((found[1] || '').replace(/^\S+\s+/, '')) !== Norm(p.Town)) throw new Error(`PostNL city '${found[1]}' differs from Cardmarket '${p.Town}'`);
    step();   // address
  } else {
    await fill(tab, S.sel('input[name=postalCode]'), p.Postcode, 'Postcode');
    await fill(tab, S.sel('input[name=town]'), p.Town, 'Plaats');
    await fill(tab, S.sel('textarea[formcontrolname=addressLine]'), p.AddressLine, 'Aanvullende adresgegevens');
    manual = await setAddress(tab, p, log);
    step();   // address
    await fill(tab, S.sel('input[name=phoneNumber]'), p.Phone, 'Telefoon');
  }
  let email = p.Email;
  if (!email && await tab.call('q', 'emailRequired')) {
    if (!fallbackEmail) throw new Error(`PostNL requires an e-mail address for ${p.Country} and Cardmarket has none; set a fallback e-mail in Settings`);
    email = fallbackEmail;
    log(`${p.Id}: e-mail required for ${p.Country}: using the fallback e-mail`);
  }
  await fill(tab, S.sel('input[name=emailAddress]'), email, 'E-mailadres');
  await sleep(300);
  const err = await tab.call('q', 'errors');
  if (err) throw new Error(`PostNL rejects the form: ${err}`);
  step();   // phone + e-mail
  await toCart(tab);
  step();
  log(`${p.Id}: in its cart (${await tab.call('q', 'total')})`);
  return { manual };
}

// Progress steps. Stamp code: page loaded, country, Brief of kaart, weight, quantity, in its cart.
// Shipping label: page loaded, country, product, weight band + option, address form, name, address,
// phone + e-mail, in its cart. At the end: carts merged, cart reloaded, total checked.
export const STEPS = { stamp: 6, tracked: 9, merge: 3 };

// All items in parallel (at most conc tabs at once); merge the carts into the first successful tab.
// onProgress(done, total, { items, of }): after every step of every item (see STEPS), for a progress bar;
// done/total count steps, items/of count the finished items. A failed item counts all its steps as done.
export async function buildCart({ stamps, tracked, fallbackEmail, conc = 6, windowId, log, onProgress = () => {} }) {
  const items = [...stamps.map(g => ({ kind: 'stamp', key: `${g.code} x${g.qty}`, g })), ...tracked.map(p => ({ kind: 'tracked', key: `${p.Id} ${p.Iso}`, p }))];
  const results = []; let next = 0, done = 0;
  const total = items.reduce((a, it) => a + STEPS[it.kind], 0) + STEPS.merge;
  const report = () => onProgress(Math.min(done, total), total, { items: results.length, of: items.length });
  report();
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (next < items.length) {
      const it = items[next++];
      const tab = await Tab.open(START, { file: 'content/pnl.js', ns: '__cmlPNL', windowId });
      tab.onPoll = t => cookieWall(t, m => log(`${it.key}: ${m}`));
      const r = { ...it, tab };
      let steps = 0;
      const step = () => { if (steps < STEPS[it.kind]) { steps++; done++; report(); } };
      try {
        const t = Date.now();
        if (it.kind === 'stamp') await stampFlow(tab, it.g, log, step);
        else Object.assign(r, await trackedFlow(tab, it.p, { fallbackEmail, log, step }));
        r.ok = true; r.ms = Date.now() - t;
        r.order = await tab.call('q', 'order'); r.total = euro(await tab.call('q', 'total'));
        if (!r.order) throw new Error('PostNL has no cart (current-order) in this tab');
      } catch (e) {
        r.ok = false; r.error = e.message;
        if (String(await tab.safe('q', '', 'path')).endsWith('/betalen')) r.error += ' (its tab is on the PostNL payment page /betalen, with the item in its cart)';
        log(`${it.key}: FAILED: ${r.error}`);
      }
      results.push(r);
      done += STEPS[it.kind] - steps;   // the rest of a failed item
      report();
    }
  }));
  const ok = results.filter(r => r.ok);
  const summary = { items: results.map(r => ({ kind: r.kind, key: r.key, ok: r.ok, error: r.error || null, manual: !!r.manual, total: r.total ?? null, ms: r.ms ?? null })) };
  if (!ok.length) { done = total; report(); return { ...summary, merged: false }; }   // failed tabs stay open to look at
  const base = ok[0];
  const holding = () => `tab(s) still holding items: ${ok.map(r => r.key).join(', ')}`;
  let entities, sum, expected, lines;
  try {
    entities = await base.tab.call('mergeOrders', ok.slice(1).map(r => r.order));
    done++; report();
    await base.tab.reload();
    await base.tab.waitFor({ text: 'Totaalbedrag' }, 20000, 'merged cart');
    done++; report();
    sum = euro(await base.tab.call('q', 'total'));
    expected = Math.round(ok.reduce((s, r) => s + (r.total || 0), 0) * 100) / 100;
    lines = await base.tab.call('q', 'cartLines');
  } catch (e) {
    done = total; report();
    log(`Cart merge FAILED: ${e.message}. No tab was closed; ${holding()}`);
    return { ...summary, merged: false, error: `Cart merge failed: ${e.message}` };
  }
  // A quantity of 2 is two entities but one line: compare lines with items, the total with the tab carts.
  const check = sum === expected && lines === ok.length;
  if (check) for (const r of ok.slice(1)) await r.tab.close();
  else log(`Cart merge check failed: no tab was closed; ${holding()}`);
  try { await ext.tabs.ungroup?.(base.tab.id); } catch { }   // tab groups: not in every Firefox
  await base.tab.activate();
  done = total; report();
  log(`Cart: ${ok.length} line(s) (${entities} entities), total € ${sum?.toFixed(2)} (expected € ${expected.toFixed(2)}, ${lines} line(s) on the page)${check ? '' : ' - CHECK THE CART'}`);
  return { ...summary, merged: true, count: ok.length, entities, total: sum, expected, check };
}
