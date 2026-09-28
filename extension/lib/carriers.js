// Carriers: who sells the postage for a cart item, and so whose cart it goes in. Every shipping method names its
// carrier (Carrier in methods.psd1); planSales copies it onto each stamp group and tracked label. The app page and
// the Cardmarket panel build carts only through buildCart here, which hands the items to their carrier's module.
// lib/postnl.js is the first one; deutschepost and dhl are known names without a module yet. none = no cart.
//
// A carrier module exports:
//   STEPS      { stamp, tracked, merge }: progress steps per stamp group, per tracked label, and for the cart at
//              the end (after the items).
//   CONC       optional: the most tabs it fills at once. A shop that keeps one cart per cookie on its server races
//              in parallel tabs: it sets CONC = 1, and buildCart never passes it a larger conc.
//   buildCart({ stamps, tracked, fallbackEmail, conc, windowId, log, onProgress }) -> result
//     stamps   [{ code, iso, weight, country, qty, ids, carrier }]: one group per stamp code ('DE-20'), weight 20
//              or 50 g, ids = the sales. country is PostNL's (Dutch) name from countries.psd1: another carrier
//              goes by iso.
//     tracked  labels from planSales: Id, Iso, Country (PostNL's name), Product, Option, Seen, Grams, First, Last,
//              Postcode, Town, the address fields (NL: Street, Number, Suffix, SuffixKey; else AddressLine and
//              Manual), Phone, Email, carrier. Product and Option are the names in methods.psd1, which are
//              PostNL's: another carrier needs its own mapping to its products (its origin's methods file names
//              them, or the module maps them).
//     fallbackEmail  for a label that needs an e-mail when Cardmarket has none
//     conc     the most tabs at once (undefined: the module's default)
//     windowId the window for the work tabs; log(text): a line for the run log
//     onProgress(done, total, { items, of }): after every step; done/total count steps (see STEPS), items/of the
//              finished items. A failed item counts all its steps as done.
//   result     { items: [{ kind, key, ok, error, manual, total, ms }], merged, count?, entities?, total?, expected?, check?, error? }
//     items    one per stamp group (kind 'stamp') or tracked label ('tracked'), key names it in the UI; ok or the
//              error (null when ok); manual = the address was typed in by hand; total = its price in euro, ms =
//              time taken (both null when it failed)
//     merged   true when the items are in one cart, in a tab in front to check and pay; then count = its lines,
//              entities (the carrier's own count), total = the cart's price, expected = the sum of the items and
//              check = the two agree and there is one line per item. error: why the cart could not be made.
// Nothing pays: the cart is left for the user.
import * as postnl from './postnl.js';

export const CARRIERS = ['postnl', 'deutschepost', 'dhl', 'none'];
const MODULES = { postnl };

// The module for a carrier, or a readable error: what = the items, for the message.
export function carrierModule(name, what, modules = MODULES) {
  if (modules[name]) return modules[name];
  if (name === 'none') throw new Error(`${what}: carrier none has no cart; buy by hand`);
  if (CARRIERS.includes(name)) throw new Error(`${what}: carrier '${name}' has no cart in cm-labels yet; buy by hand`);
  throw new Error(`${what}: unknown carrier '${name}' (known: ${CARRIERS.join(', ')}); load the sales again`);
}

// One cart for the items: all of them must have the same carrier (each carrier has its own shop and payment).
// Nothing opens before the carrier is known. modules: for tests.
export async function buildCart({ stamps, tracked, conc, ...rest }, modules = MODULES) {
  const items = [...stamps.map(g => [g.carrier, g.code]), ...tracked.map(p => [p.carrier, p.Id])];
  const names = [...new Set(items.map(([c]) => c))];
  if (!names.length) return { items: [], merged: false };
  if (names.length > 1) throw new Error(`one cart per carrier: these items are for ${names.map(n => `${n} (${items.filter(([c]) => c === n).map(([, k]) => k).join(', ')})`).join(' and ')}`);
  const mod = carrierModule(names[0], items.map(([, k]) => k).join(', '), modules);
  return mod.buildCart({ ...rest, stamps, tracked, conc: mod.CONC == null ? conc : Math.min(conc ?? mod.CONC, mod.CONC) });
}
