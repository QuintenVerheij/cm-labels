// Label layout as an HTML template (Settings tab). The fields {NAME} {ADDRESS} {POSTCODE} {CITY} {COUNTRY} {ID} are
// filled per sale (HTML-escaped; ADDRESS = street and extra lines, joined with <br>). The browser prints what it
// shows, so the preview is the print.
// class="fit" (optional): a line with it gets a smaller font when it is too wide, and the label's content gets a
// smaller font when it is too high. Scripts and on... handlers in a template do not run (extension CSP).
// <cml-barcode ...> becomes an SVG barcode after the fields are filled (see barcode.js).
import { expandBarcodes } from './barcode.js';
import { esc } from './esc.js';
export const FIELDS = ['NAME', 'ADDRESS', 'POSTCODE', 'CITY', 'COUNTRY', 'ID'];

// Default: the 4 address lines (name, address, postcode + city, country), vertically centred, bold, font size
// from the label height. Stored as '' so it follows the label size.
export function defaultTemplate(W, H) {
  const size = Math.max(2.5, Math.min(8, (H - 4) / 4 / 1.25)).toFixed(1);
  return `<div style="height:100%; box-sizing:border-box; padding:2mm; display:flex; flex-direction:column; justify-content:center;
     font:700 ${size}mm/1.2 'Segoe UI', Arial, sans-serif; white-space:nowrap">
  <div class="fit">{NAME}</div>
  <div class="fit">{ADDRESS}</div>
  <div class="fit">{POSTCODE} {CITY}</div>
  <div class="fit">{COUNTRY}</div>
</div>`;
}

export function fill(tpl, f) {
  return tpl.replace(/\{(NAME|ADDRESS|POSTCODE|CITY|COUNTRY|ID)\}/g, (_, k) =>
    k === 'ADDRESS' ? (f.ADDRESS || []).map(esc).filter(Boolean).join('<br>') : esc(f[k]));
}

// One label: W x H mm, white, the filled template inside.
export const labelHtml = (tpl, fields, W, H) =>
  `<div class="cml-label" style="position:relative;width:${W}mm;height:${H}mm;overflow:hidden;background:#fff;color:#000;box-sizing:border-box">${expandBarcodes(fill(tpl, fields))}</div>`;

// Apply class="fit" in these labels (they must be in the document, so there is layout). Lines first, then the
// whole content when it is higher than the label.
// All fit lines of one label shrink by the same factor (the one the widest line needs), so they keep their sizes
// relative to each other. A label without layout (hidden, width 0) is left as it is: call this again when it shows.
// A second call on a fitted label changes nothing.
export function fitLabels(root) {
  for (const label of root.querySelectorAll('.cml-label')) {
    const fits = [...label.querySelectorAll('.fit')];
    if (!fits.length || !label.clientWidth) continue;
    const shrink = k => { for (const el of fits) el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * k}px`; };
    const widest = () => Math.max(...fits.map(el => el.scrollWidth / Math.max(1, el.clientWidth)));
    for (let i = 0; i < 8 && widest() > 1.005; i++) shrink(1 / widest() * 0.995);   // converges in 1-2 steps
    const content = label.firstElementChild;
    for (let i = 0; i < 60 && content && content.scrollHeight > label.clientHeight + 0.5; i++) shrink(0.96);
  }
}
