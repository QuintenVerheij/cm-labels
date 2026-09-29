// Images and fonts the user uploads for the label layout (Settings tab). They are stored in the settings as
//   { name, kind: 'image', data: 'data:image/png;base64,...', w, h, mm }   (w, h in dots; mm = width on the label)
//   { name, kind: 'font',  data: 'data:font/ttf;base64,...',  format: 'truetype' }
// The layout uses an image as <img src="asset:name"> (also in CSS: url(asset:name)) and a font by its name in font-family.
// Everything here is plain data work, so the tests can run it; the canvas work is in assets-ui.js.

export const LIMITS = { image: 5 * 1024 * 1024, font: 1024 * 1024, total: 2 * 1024 * 1024, maxMm: 300, maxDots: 4800 };
export const FONT_FORMATS = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };
export const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

const NAME = /^[A-Za-z0-9_-]{1,32}$/;
const DATA = /^data:[\w/+.-]*;base64,[A-Za-z0-9+/=]+$/;

export const extOf = fileName => (String(fileName).match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase() || '';
export const kindOf = fileName => extOf(fileName) in FONT_FORMATS ? 'font' : IMAGE_TYPES.includes(extOf(fileName)) ? 'image' : null;
export const validName = n => NAME.test(String(n));
// A file name as an asset name: "My Logo (2).PNG" -> "my-logo-2"
export const slug = fileName => String(fileName).replace(/\.[A-Za-z0-9]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'asset';
export function uniqueName(name, assets = []) {
  const taken = new Set(assets.map(a => a.name));
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) { const n = `${name.slice(0, 29)}-${i}`; if (!taken.has(n)) return n; }
}
export const totalSize = assets => (assets || []).reduce((sum, a) => sum + String(a.data || '').length, 0);

// The template with every asset:name in it replaced by the data URI of that image. An unknown name stays as it is.
export function withAssets(tpl, assets) {
  const images = new Map((assets || []).filter(a => a.kind === 'image' && NAME.test(a.name) && DATA.test(a.data)).map(a => [a.name, a.data]));
  return images.size ? tpl.replace(/asset:([A-Za-z0-9_-]+)/g, (m, n) => images.get(n) ?? m) : tpl;
}

// @font-face rules for the fonts, one per font; the family is the name of the asset.
export function fontFaceCss(assets) {
  return (assets || []).filter(a => a.kind === 'font' && NAME.test(a.name) && DATA.test(a.data) && Object.values(FONT_FORMATS).includes(a.format))
    .map(a => `@font-face { font-family: "${a.name}"; src: url(${a.data}) format("${a.format}"); }`).join('\n');
}

// What to put in the layout for an asset.
export const snippet = a => a.kind === 'font' ? `font-family: "${a.name}", sans-serif;` : `<img src="asset:${a.name}" style="width:${a.mm}mm">`;
