// Carriers: who sells the postage for a cart item, and so whose cart it goes in. none = no cart.
//
// A carrier module exports:
//   NAME       its display name ('PostNL'): the UI says "Add to PostNL cart", "3 item(s) in the PostNL cart".
//   ORIGINS    the host patterns of its shop (['https://jouw.postnl.nl/*']): the app asks for them with Cardmarket's
//              where the browser treats host permissions as optional. The manifest lists them too.
//   BRACKETS   its stamp weights in g, ascending ([20, 50]). planSales takes them from BRACKETS here: a stamp goes in
//              the smallest bracket that holds the sale's grams; heavier, or a carrier without brackets, is bought
//              by hand. A carrier with no stamps exports [].
//   STEPS      { stamp, tracked, merge }: progress steps per stamp group, per tracked label, and for the cart at
//              the end (after the items).
//   CONC       optional: the most tabs it fills at once. A module that needs one cart per cookie (a shop that keeps
//              the cart on its server, so parallel tabs race on it) declares CONC = 1; buildCart never passes it a
//              larger conc.
//   buildCart({ stamps, tracked, fallbackEmail, conc, windowId, log, onProgress }) -> result
//     stamps   [{ code, iso, weight, country, qty, ids, weights, carrier }]: one group per stamp code ('DE-20') of
//              this carrier; weight = the bracket (from its BRACKETS), ids = the sales, weights = each sale's grams
//              in the order of ids, so a module can bracket again (a run saved before weights has none). country
//              is PostNL's (Dutch) name from countries.psd1: another carrier goes by iso.
//     tracked  labels from planSales: Id, Iso, Country (PostNL's name), Product, Option, Seen, Grams, First, Last,
//              Postcode, Town, the address fields (NL: Street, Number, Suffix, SuffixKey; else AddressLine and
//              Manual), Phone, Email, carrier. Product and Option are the names in methods.psd1, which are
//              PostNL's: another carrier needs its own mapping to its products (its origin's methods file names
//              them, or the module maps them). A tracked method is Service tracked (postnl is the older name).
//     fallbackEmail  for a label that needs an e-mail when Cardmarket has none
//     conc     the most tabs at once (undefined: the module's default)
//     windowId the window for the work tabs; log(text): a line for the run log
//     onProgress(done, total, { items, of }): after every step; done/total count steps (see STEPS), items/of the
//              finished items. A failed item counts all its steps as done. Only passed when the caller gave one.
//   result     { items: [{ kind, key, ok, error, manual, total, ms }], merged, count?, entities?, total?, expected?, check?, error? }
//     items    one per stamp group (kind 'stamp') or tracked label ('tracked'), key names it in the UI; ok or the
//              error (null when ok); manual = the address was typed in by hand; total = its price in euro, ms =
//              time taken (both null when it failed)
//     merged   true when the items are in one cart, in a tab in front to check and pay; then count = its lines,
//              entities (the carrier's own count), total = the cart's price, expected = the sum of the items and
//              check = the two agree and there is one line per item. error: why the cart could not be made.
//   A cart that lives on the shop's server (per cookie) can already hold lines from an earlier run or from the
//   user. The module must refuse to add to such a cart (the items fail with the reason), or report those lines
//   in its result (count and check then show them): never add to them silently, or the user pays twice.
// Nothing pays: the cart is left for the user.
//
// buildCart here returns { carts: [{ carrier, ...result }] }, one per carrier in the order of first appearance
// (stamp groups first). A module that throws gives { carrier, items: [], merged: false, error, aborted: true }
// and the next carrier still runs; tabs it opened stay open.
import * as postnl from './postnl.js';
import * as deutschepost from './deutschepost.js';

export const CARRIERS = ['postnl', 'deutschepost', 'dhl', 'none'];
const MODULES = { postnl, deutschepost };

// For planSales: carrier -> its stamp weights. For the permission request: every carrier's shop.
export const BRACKETS = Object.fromEntries(Object.entries(MODULES).map(([name, m]) => [name, m.BRACKETS]));
export const ORIGINS = Object.values(MODULES).flatMap(m => m.ORIGINS);

// The display name of a carrier ('PostNL'), or its id when it has no module.
export const carrierName = (name, modules = MODULES) => modules[name]?.NAME ?? String(name);
// The carriers of the items, in the order of first appearance (stamp groups first).
export const carriersOf = (stamps = [], tracked = []) => [...new Set([...stamps, ...tracked].map(x => x.carrier))];
// The carriers an origin's methods name (none left out): for text before any sale is planned.
export const methodCarriers = methods => [...new Set(Object.values(methods || {}).filter(m => m.Service !== 'manual').map(m => m.Carrier || 'none'))].filter(c => c !== 'none');
// 'PostNL cart', 'PostNL and DHL carts', or 'cart' when no carrier is known.
export function cartTitle(names, modules = MODULES) {
  const n = names.map(c => carrierName(c, modules));
  return !n.length ? 'cart' : n.length === 1 ? `${n[0]} cart` : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]} carts`;
}

// The errors of the carriers whose module threw, as one message, or null: the callers show the run as failed.
export function abortedError({ carts }, modules = MODULES) {
  const bad = carts.filter(c => c.aborted);
  if (!bad.length) return null;
  return carts.length === 1 ? bad[0].error : bad.map(c => `${carrierName(c.carrier, modules)}: ${c.error}`).join('; ');
}

// Keys for an error message: the first few, then a count.
function shortList(keys, max = 3) {
  return keys.length <= max ? keys.join(', ') : `${keys.slice(0, max).join(', ')} and ${keys.length - max} more`;
}

// The module for a carrier, or a readable error: what = the items, for the message.
export function carrierModule(name, what, modules = MODULES) {
  if (modules[name]) return modules[name];
  if (name === 'none') throw new Error(`${what}: carrier none has no cart; buy by hand`);
  if (CARRIERS.includes(name)) throw new Error(`${what}: carrier '${name}' has no cart in cm-labels yet; buy by hand`);
  throw new Error(`${what}: unknown carrier '${name}' (known: ${CARRIERS.join(', ')}); load the sales again`);
}

// One cart per carrier (each carrier has its own shop and payment), built one carrier at a time. Every carrier's
// module is found before any tab opens. modules: for tests.
export async function buildCart({ stamps, tracked, conc, onProgress, ...rest }, modules = MODULES) {
  const runs = carriersOf(stamps, tracked).map(carrier => {
    const s = stamps.filter(g => g.carrier === carrier), t = tracked.filter(p => p.carrier === carrier);
    const mod = carrierModule(carrier, shortList([...s.map(g => g.code), ...t.map(p => p.Id)]), modules);
    return { carrier, mod, stamps: s, tracked: t, n: s.length + t.length, steps: s.length * mod.STEPS.stamp + t.length * mod.STEPS.tracked + mod.STEPS.merge };
  });
  // One progress bar over all carriers: each module's steps and items are counted after the earlier carriers'.
  const total = runs.reduce((a, r) => a + r.steps, 0), of = runs.reduce((a, r) => a + r.n, 0);
  const carts = [];
  let stepsBefore = 0, itemsBefore = 0;
  for (const r of runs) {
    const progress = onProgress && ((done, _total, it) => onProgress(stepsBefore + Math.min(done, r.steps), total, { items: itemsBefore + Math.min(it?.items ?? 0, r.n), of }));
    const c = r.mod.CONC == null ? conc : Math.min(conc ?? r.mod.CONC, r.mod.CONC);
    try {
      carts.push({ carrier: r.carrier, ...await r.mod.buildCart({ ...rest, stamps: r.stamps, tracked: r.tracked, conc: c, ...(progress && { onProgress: progress }) }) });
    } catch (e) {
      carts.push({ carrier: r.carrier, items: [], merged: false, error: e.message, aborted: true });
    }
    stepsBefore += r.steps; itemsBefore += r.n;
  }
  return { carts };
}
