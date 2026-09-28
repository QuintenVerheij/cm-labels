// The languages of Cardmarket's pages the extension reads, and the country names used on them.
export const LANGS = ['en', 'de'];
export const langFromPath = path => {
  const m = String(path).match(/^\/([A-Za-z]{2})\//);
  const l = m?.[1].toLowerCase();
  return LANGS.includes(l) ? l : null;
};

// German country names by ISO code: the names of the Cardmarket help centre (locale=de). CA is not in that list:
// "Kanada" is a best guess.
export const COUNTRY_DE = {
  AT: 'Österreich', BE: 'Belgien', BG: 'Bulgarien', CA: 'Kanada', CH: 'Schweiz', CY: 'Zypern', CZ: 'Tschechien',
  DE: 'Deutschland', DK: 'Dänemark', EE: 'Estland', ES: 'Spanien', FI: 'Finnland', FR: 'Frankreich',
  GB: 'Großbritannien', GR: 'Griechenland', HR: 'Kroatien', HU: 'Ungarn', IE: 'Irland', IS: 'Island', IT: 'Italien',
  JP: 'Japan', LI: 'Liechtenstein', LT: 'Litauen', LU: 'Luxemburg', LV: 'Lettland', MT: 'Malta', NL: 'Niederlande',
  NO: 'Norwegen', PL: 'Polen', PT: 'Portugal', RO: 'Rumänien', SE: 'Schweden', SG: 'Singapur', SI: 'Slowenien',
  SK: 'Slowakei',
};

// Country name on a sale page (English or German) -> ISO code; countries.json entry [0] is the English name.
export const byNameOf = countries => Object.fromEntries(
  Object.entries(countries).flatMap(([iso, v]) => [[v[0], iso], ...(COUNTRY_DE[iso] ? [[COUNTRY_DE[iso], iso]] : [])]),
);
