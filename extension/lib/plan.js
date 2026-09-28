// What to do with each sale: stamp (70x40 label + postzegelcode), PostNL tracked label, or by hand.
// Address rules: NL house number + suffix keys, street/extra split and PostNL's extra fields outside NL.

export const Norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^a-z0-9]/g, '');
// House number suffix compare key: letters and digits only, upper case ("A-1", "a 1", "A/1" -> "A1"; "t/o" -> "TO").
export const SuffixKey = s => String(s ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

const THRESHOLD = 25;   // an untracked sale at or above this article value is suspicious: skip it

// A keyword right after an article or preposition is part of a name ("Via della Scala", "Am Stock").
const NotAfterArticle = '(?<!\\b(?:de|del|della|dello|delle|des|du|la|le|el|los|las|am|im|zum|zur|der|dem)\\s)';
const After = '([\\s,.:]|\\d|$)';
// A line with one of these words is extra (apartment, building, c/o), even when it ends in a number.
const ExtraWords = new RegExp('(^|[\\s,.])' + NotAfterArticle + '(app(artement)?|appt?|apt|apartment|unit|suite|bte|r[eé]sidence|b[aâ]t(iment)?|[eé]tage|etg|escalier|piso|puerta|escalera|esc|planta|int|interno|scala|c\\/o|p\\/a|bus|bo[iî]te|flat|stock|whg|wohnung|hinterhaus|vorderhaus|bt|lokal|lok|lgh|zimmer|eingang|stiege|loja|(?<=\\d.*)(?:haus|hof|top)(?=\\s*\\d))' + After, 'i');
// Extra text -> PostNL's extra fields (35 characters each), split at key words, text kept as written.
const ExtraFields = {
  Verdieping: new RegExp('(^|[\\s,])' + NotAfterArticle + '(\\d+\\s*[º°ª]|\\d+\\s*\\.\\s*(th|tv|mf)(?=[\\s,.:]|$)|(\\d+\\s*(e|er|re|[eè]me)?\\s*\\.?\\s*)?([eé]tage|etg|piso|planta|stock|floor)' + After + ')', 'i'),
  Flat: new RegExp('(^|[\\s,])' + NotAfterArticle + '(app(artement)?|appt?|apt|apartment|unit|suite|bte|flat|whg|wohnung|int|interno|bus|bo[iî]te)' + After, 'i'),
  Trap: new RegExp('(^|[\\s,])' + NotAfterArticle + '(escalier|escalera|esc|scala|stiege)' + After, 'i'),
  Deur: new RegExp('(^|[\\s,])' + NotAfterArticle + '(porte|puerta|door|t[uü]r)' + After, 'i'),
};

export function splitExtra(text) {
  const out = { Gebouw: [], Verdieping: [], Flat: [], Trap: [], Deur: [] };
  for (const part of String(text).split(',').map(s => s.trim()).filter(Boolean)) {
    const cuts = new Set([0, part.length]);
    for (const re of Object.values(ExtraFields)) {
      for (const m of part.matchAll(new RegExp(re.source, 'gi'))) cuts.add(m.index + (m[0].length - m[0].replace(/^[\s,]+/, '').length));
    }
    const c = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < c.length - 1; i++) {
      const piece = part.slice(c[i], c[i + 1]).replace(/^[\s,]+|[\s,]+$/g, '');
      if (!piece) continue;
      const f = Object.keys(ExtraFields).find(k => { const m = piece.match(ExtraFields[k]); return m && m.index === 0; }) || 'Gebouw';
      out[f].push(piece);
    }
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v.length).map(([k, v]) => [k, v.join(', ')]));
}

// A street type word (with articles) that a number can follow inside the name: "Via 4 Novembre", "Straße des 17. Juni".
const StreetType = /^(?:(?:via|viale|piazza|corso|calle|plaza|rue|ul|plac|aleja|strada)\.?|stra(?:ß|ss)e(?=\s+(?:de|del|della|des|du|la|le|der|von|van)))(\s+(de|del|della|des|du|la|le|der|von|van))*$/iu;
// Street line -> street, number, suffix; extra lines + leftovers -> PostNL extra fields. FR and LU write the
// number first ("12 rue de la Paix"), the others last. Cardmarket marks the street line (.Street) and the
// extra lines (.Extra); the street line is tried first.
export function splitStreet(iso, street, extras) {
  const first = /^(?<nr>\d{1,5})(?!\d)\s*(?<ext>bis|ter|quater|[A-Za-z](?![A-Za-z.]))?\s*,?\s+(?<street>\D.*)$/;
  const last = /^(?<street>.*?\D)[\s,]+(?<nr>\d{1,5})(?!\d)\s*\/?\s*(?<ext>bis|ter|quater|[A-Za-z](?![A-Za-z.]))?(?<more>.*)$/;
  const lastGreedy = /^(?<street>.*\D)[\s,]+(?<nr>\d{1,5})(?!\d)\s*\/?\s*(?<ext>bis|ter|quater|[A-Za-z](?![A-Za-z.]))?(?<more>.*)$/;
  const order = ['FR', 'LU'].includes(iso) ? [first, last] : [last, first];
  const whole = [street, ...extras].filter(Boolean);
  // The whole lines first; only when none fits, each line split at its commas ("Flat 2, 10 High Street").
  const attempts = [whole, whole.flatMap(l => l.split(',').map(p => p.trim()).filter(Boolean))];
  for (const [lines, re] of attempts.flatMap(l => order.map(r => [l, r]))) {
    for (let i = 0; i < lines.length; i++) {
      const w = lines[i].match(ExtraWords);
      if (w && w.index === 0) continue;
      const head = w ? lines[i].slice(0, w.index) : lines[i];
      const tail = w ? lines[i].slice(w.index).replace(/^[\s,]+|[\s,]+$/g, '') : '';
      let m = head.trim().match(re);
      if (!m) continue;
      // A word after the first number and another number later on: the first number belongs to the street
      // name ("Via 4 Novembre 10"), so the house number is the last one.
      if (re === last && StreetType.test(m.groups.street.trim()) && /\d/.test(m.groups.more) && /^[\s.,]*(?![A-Z]{2,3}(?![A-Za-z]))\p{L}{2,}/u.test(m.groups.more)) m = head.trim().match(lastGreedy) ?? m;
      const extra = lines.filter((_, j) => j !== i);
      const more = [String(m.groups.more ?? '').replace(/^[\s,\-/]+|[\s,\-/]+$/g, ''), tail].filter(Boolean).join(' ');
      if (more) extra.push(more);
      const fields = splitExtra(extra.join(', '));
      const long = Object.entries(fields).filter(([, v]) => v.length > 35);
      if (long.length) throw new Error(`extra address text too long for PostNL's ${long.map(([k]) => k).join(', ')} field (35 characters): ${long.map(([, v]) => v).join(' | ')}`);
      return { Street: m.groups.street.replace(/^[\s,]+|[\s,]+$/g, ''), Nr: m.groups.nr, Ext: m.groups.ext || '', Extra: extra.join(', '), Fields: fields };
    }
  }
  return null;
}

function splitName(n) {
  const w = String(n).trim().split(/\s+/);
  if (w.length < 2) throw new Error(`name '${n}' has one word; PostNL needs a first and a last name`);
  return [w[0], w.slice(1).join(' ')];
}

// NL: street, house number (1-5 digits), then up to two suffix parts (huisletter and/or toevoeging). If the
// first split gives a key longer than BAG allows (letter + 4), the street holds digits: take the last number.
function splitNL(line) {
  const rest = '(?<rest>(?:\\s*[-/.]?\\s*[A-Za-z0-9]{1,6}){0,2})\\s*$';
  for (const street of ['(?<street>.+?)', '(?<street>.+)']) {
    const m = line.match(new RegExp(`^${street}\\s+(?<nr>\\d{1,5})${rest}`));
    if (m && street === '(?<street>.+?)' && /^\s*\d+$/.test(m.groups.rest) && /^(1[5-9]|20)\d\d$/.test(m.groups.nr)) continue;
    if (m && SuffixKey(m.groups.rest).length <= 5) return { Street: m.groups.street.trim(), Number: m.groups.nr, Suffix: m.groups.rest.trim(), SuffixKey: SuffixKey(m.groups.rest) };
  }
  throw new Error(`no house number (+ suffix of at most 5 letters/digits) at the end of '${line}'`);
}

function trackedPlan(s, m, cfg, origin) {
  const p = { Id: s.id, Iso: s.iso, Product: m.Product, Option: m.Option, Seen: m.Seen || '', Grams: s.grams, Phone: s.phone || '', Email: s.email || '', warnings: [] };
  const c = cfg.countries[s.iso];
  p.Country = c?.[1];
  if (m.Only && m.Only !== s.iso) throw new Error(`method '${s.methodName}' is for ${m.Only} only, sale goes to ${s.iso}`);
  if (!s.grams) throw new Error("no 'max. NNNg' in the method");
  if (!c || c.length < 3) throw new Error(`country '${s.country}' has no postcode pattern in the country data (source file countries.psd1)`);
  [p.First, p.Last] = splitName(s.name);
  const pcm = s.city.match(new RegExp(`^(?:[A-Z]{1,2}-)?(?<pc>${c[2]})\\s+(?<town>.+)$`, 'i'));
  if (!pcm) throw new Error(`line '${s.city}' does not start with a ${s.iso} postcode`);
  p.Postcode = pcm.groups.pc.toUpperCase(); p.Town = pcm.groups.town.trim();
  if (s.iso === 'NL') {
    if (s.extras.length) p.warnings.push(`extra address line(s) '${s.extras.join(', ')}' are not sent: the NL form has no field for them`);
    Object.assign(p, splitNL(s.street));
    p.Postcode = p.Postcode.replace(/\s/g, '').toUpperCase();
    if (p.Phone) p.warnings.push('the NL form has no phone field; the phone number is not sent');
  } else {
    if (p.Town.length > 35) throw new Error(`city '${p.Town}' is longer than 35 characters (PostNL limit)`);
    p.AddressLine = [...s.extras, s.street].filter(Boolean).join(', ');
    p.Manual = splitStreet(s.iso, s.street, s.extras);
    if (!p.Manual) p.warnings.push('no street + house number found; only PostNL address suggestions can be used');
    // A domestic sale outside NL shows the origin's own layout: street, number + suffix, then extras.
    if (s.iso === origin && p.Manual) {
      Object.assign(p, { Street: p.Manual.Street, Number: p.Manual.Nr, Suffix: p.Manual.Ext, Extra: p.Manual.Extra });
      // A German house number range ("3-5") is the number, not a number plus an extra.
      const range = origin === 'DE' && s.street.match(/^(?<street>.*\D)[\s,]+(?<nr>\d{1,5}-\d{1,5})\s*$/);
      if (range) Object.assign(p, { Street: range.groups.street.trim(), Number: range.groups.nr, Suffix: '', Extra: s.extras.join(', ') });
    }
  }
  if (p.Seen === 'guess') p.warnings.push('the PostNL mapping for this method is a guess (see the method data, source file methods.psd1); check the choice');
  return p;
}

// Fields for the HTML label template (ID = the sale id, e.g. for a barcode). The Cardmarket city line is split with the postcode pattern of the
// country ("3028BX Rotterdam" -> POSTCODE 3028BX, CITY Rotterdam); without a match CITY is the whole line.
function labelFields(s, cfg) {
  const re = cfg.countries[s.iso]?.[2];
  const m = re && s.city.match(new RegExp(`^(?:[A-Z]{1,2}-)?(?<pc>${re})\\s+(?<town>.+)$`, 'i'));
  return { NAME: s.name, ADDRESS: [...s.extras, s.street].filter(Boolean), POSTCODE: m ? m.groups.pc.toUpperCase() : '', CITY: m ? m.groups.town.trim() : s.city, COUNTRY: s.country, ID: String(s.id ?? '') };
}

// sales: from loadSales in cardmarket.js. Returns the breakdown for the UI and the cart.
export function planSales(sales, cfg, origin = 'NL') {
  const stamps = new Map(), print = [], tracked = [], skipped = [], all = [];
  for (const r of sales) {
    if (r.error) { skipped.push({ id: r.id, reason: r.error }); continue; }
    const byKind = k => r.lines.filter(l => l.kind === k).map(l => l.text);
    const s = { ...r, name: byKind('Name')[0] || '', extras: byKind('Extra'), street: byKind('Street')[0] || '', city: byKind('City')[0] || '', country: byKind('Country')[0] || '' };
    s.address = r.lines.map(l => l.text);
    s.iso = cfg.byName[s.country] || null;
    const m = cfg.methods[r.methodName];
    s.service = m ? m.Service : (r.tracked === false ? 'stamp' : 'unknown');
    all.push(s);
    const base = { id: s.id, iso: s.iso, value: s.value, method: s.method, address: s.address };
    if (s.service === 'stamp') {
      if (!Number.isFinite(s.value)) { skipped.push({ ...base, reason: 'untracked, article value could not be read from the page; check the sale' }); continue; }
      if (s.value >= THRESHOLD) { skipped.push({ ...base, reason: `untracked, article value ${s.value} >= ${THRESHOLD}; check the sale` }); continue; }
      print.push({ Id: s.id, Value: s.value, Method: s.method, Address: s.address, Grams: s.grams, Iso: s.iso, Fields: labelFields(s, cfg) });
      let reason = null;
      if (!s.iso) reason = `country '${s.country}' is not in the country data (source file countries.psd1); buy its stamp by hand`;
      else if (!s.grams || s.grams > 50) reason = `no stamp weight up to 50 g in '${s.method}'; buy its stamp by hand`;
      if (reason) { skipped.push({ ...base, reason: 'label printed, stamp by hand: ' + reason }); continue; }
      const w = s.grams <= 20 ? 20 : 50, code = `${s.iso}-${w}`;
      if (!stamps.has(code)) stamps.set(code, { code, iso: s.iso, weight: w, country: cfg.countries[s.iso][1], qty: 0, ids: [] });
      const g = stamps.get(code); g.qty++; g.ids.push(s.id);
    } else if (s.service === 'postnl') {
      try { tracked.push({ ...trackedPlan(s, m, cfg, origin), address: s.address, method: s.method, value: s.value }); }
      catch (e) { tracked.push({ Id: s.id, Iso: s.iso, Product: m.Product, Option: m.Option, error: e.message, address: s.address, method: s.method, value: s.value, warnings: [] }); }
    } else {
      skipped.push({ ...base, reason: s.service === 'manual' ? `manual method '${r.methodName}': buy by hand` : `unknown tracked method '${r.methodName}': add it to the method data (source file methods.psd1)` });
    }
  }
  const stampList = [...stamps.values()].sort((a, b) => (a.iso !== origin) - (b.iso !== origin) || a.iso.localeCompare(b.iso) || a.weight - b.weight);
  return {
    stamps: stampList, stampLine: stampList.map(g => `${g.code}x${g.qty}`).join(' '),
    print, tracked, skipped, count: sales.length,
  };
}
