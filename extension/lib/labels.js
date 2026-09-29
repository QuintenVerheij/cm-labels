// Address labels: the HTML template of the Settings tab (lib/template.js), printed through the browser's print
// dialog, where you pick the printer. The preview is the same HTML.
// Two paper modes (Settings):
// - Label printer: one label per printed page (no margins). Rotation: a printer that feeds the label short side
//   first wants a portrait page (e.g. 40x70 for a 70x40 label); with 90 or 270 degrees the page is portrait and
//   each label is turned on it.
// - Sheet: a sheet of paper (e.g. A4) split in columns x rows; label size = paper size / columns, rows. The labels
//   fill the cells row by row, from position `start` on the first sheet (so a sheet with used labels can be used
//   again).
import { defaultTemplate, labelHtml as oneLabel, fitLabels } from './template.js';
import { t } from './messages.js';
import { withAssets, fontFaceCss } from './assets.js';

export const PAPERS = { 'A4': [210, 297], 'A4 landscape': [297, 210], 'A5': [148, 210], 'A5 landscape': [210, 148], 'Letter': [215.9, 279.4] };
export const SHEET = { on: false, paperW: 210, paperH: 297, cols: 3, rows: 8, start: 1 };

export const sheetOf = s => ({ ...SHEET, ...(s.sheet || {}) });
export const isSheet = s => !!s.sheet?.on;
export const perSheet = s => { const g = sheetOf(s); return g.cols * g.rows; };
// Settings as the label sees them: in sheet mode the label is one cell (and never turned).
export function effective(s) {
  if (!isSheet(s)) return s;
  const g = sheetOf(s);
  return { ...s, width: g.paperW / g.cols, height: g.paperH / g.rows, rotate: 0 };
}
export const mm = v => String(Math.round(v * 100) / 100);   // 37.125 -> "37.13", 70 -> "70"

export const template = s => { const e = effective(s); return (e.html && e.html.trim()) || defaultTemplate(e.width, e.height); };
export const labelHtml = (fields, s) => { const e = effective(s); return oneLabel(withAssets(template(e), e.assets), fields, e.width, e.height); };
export { fitLabels };

// Continuous roll (label printer mode): the roll has one fixed width, the height of the label is the cut length, and
// `feed` mm of blank space follows each label so the cut does not touch the text. The printer driver does the cutting.
export const isRoll = s => !isSheet(s) && s.media === 'roll';
export const feedOf = s => isRoll(s) ? Math.min(50, Math.max(0, +s.feed || 0)) : 0;

// Paper size of one printed page: the sheet, or the label size (swapped for 90/270 degrees). The page is as long as
// the label plus the feed, along the way the paper leaves the printer (the page height).
export function paper(s) {
  if (isSheet(s)) { const g = sheetOf(s); return { w: g.paperW, h: g.paperH, r: 0 }; }
  const r = ((+s.rotate || 0) % 360 + 360) % 360, feed = feedOf(s);
  return r % 180 ? { w: s.height, h: s.width + feed, r } : { w: s.width, h: s.height + feed, r };
}
// CSS for the printed pages (and their screen view).
export function printCss(s) {
  const { w, h, r } = paper(s);
  const turn = { 0: 'none', 90: `translateX(${s.height}mm) rotate(90deg)`, 180: `translate(${s.width}mm, ${s.height}mm) rotate(180deg)`, 270: `translateY(${s.width}mm) rotate(-90deg)` }[r] || 'none';
  return `${fontFaceCss(s.assets)}
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .cml-page { position: relative; width: ${w}mm; height: ${h}mm; overflow: hidden; break-after: page; page-break-after: always; }
    .cml-page:last-child { break-after: auto; page-break-after: auto; }
    .cml-page > .cml-label { position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: ${turn}; }
    .cml-cell { position: absolute; overflow: hidden; }
    .cml-label img[src^="data:image/png"] { image-rendering: pixelated; }`;
}
export const pageHtml = (fields, s) => `<div class="cml-page">${labelHtml(fields, s)}</div>`;

// The printed pages for these orders, one HTML string per page. Sheet mode: the cells before `start` on the
// first sheet stay empty. mark(i, kind): extra HTML in cell i (1-based) of a sheet, for the preview only;
// kind 'used' (before start) | 'label' | 'free'.
export function pages(orders, s, mark = null) {
  if (!isSheet(s)) return orders.map(o => pageHtml(o.Fields, s));
  const g = sheetOf(s), n = g.cols * g.rows, start = Math.min(Math.max(1, Math.round(+g.start || 1)), n);
  const slots = [...Array(start - 1).fill(null), ...orders];
  const cw = g.paperW / g.cols, ch = g.paperH / g.rows, out = [];
  for (let p = 0; p < Math.max(1, Math.ceil(slots.length / n)); p++) {
    let cells = '';
    for (let i = 0; i < n; i++) {
      const o = slots[p * n + i], kind = p === 0 && i < start - 1 ? 'used' : o ? 'label' : 'free';
      if (!o && !mark) continue;
      cells += `<div class="cml-cell" data-cell="${i + 1}" data-kind="${kind}" style="position:absolute;overflow:hidden;left:${(i % g.cols) * cw}mm;top:${Math.floor(i / g.cols) * ch}mm;width:${cw}mm;height:${ch}mm">${o ? labelHtml(o.Fields, s) : ''}${mark ? mark(i + 1, kind) : ''}</div>`;
    }
    out.push(`<div class="cml-page" style="position:relative;width:${g.paperW}mm;height:${g.paperH}mm;overflow:hidden;background:#fff">${cells}</div>`);
  }
  return out;
}
export const pagesHtml = (orders, s, mark) => pages(orders, s, mark).join('');
export const pageCount = (orders, s) => isSheet(s) ? Math.max(1, Math.ceil((Math.min(Math.max(1, +sheetOf(s).start || 1), perSheet(s)) - 1 + orders.length) / perSheet(s))) : orders.length;
// What the print dialog needs: "3 labels on 1 sheet of 210 x 297 mm" / "1 label of 70 x 40 mm".
export function printSummary(orders, s) {
  const { w, h } = paper(s), e = effective(s);
  return isSheet(s) ? t('print.summarySheet', { n: orders.length, w: mm(e.width), h: mm(e.height), sheets: pageCount(orders, s), pw: mm(w), ph: mm(h) })
    : isRoll(s) ? t('print.summaryRoll', { n: orders.length, w: mm(s.width), h: mm(s.height) }) : t('print.summary', { n: orders.length, w: mm(s.width), h: mm(s.height) });
}

// Opens the print dialog for these labels. Resolves when the dialog closes.
export function printLabels(orders, s) {
  const { w, h } = paper(s);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>cm-labels ${mm(w)}x${mm(h)} mm</title><style>${printCss(s)}</style></head>
    <body>${pagesHtml(orders, s)}</body></html>`;
  return new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = doc;
    frame.onload = async () => {
      try { await frame.contentDocument.fonts.ready; } catch { }
      fitLabels(frame.contentDocument);
      const done = () => { frame.remove(); resolve(); };
      frame.contentWindow.addEventListener('afterprint', done, { once: true });
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => { if (frame.isConnected) done(); }, 10 * 60 * 1000);
    };
    document.body.append(frame);
  });
}
