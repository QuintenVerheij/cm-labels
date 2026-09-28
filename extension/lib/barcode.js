// <cml-barcode> in a label template -> an SVG barcode (bwip-js, bundled in vendor/bwip-js, no network).
//   <cml-barcode type="code128" value="{ID}" height="8mm" module="0.25mm" text="true"></cml-barcode>
//   <cml-barcode type="qrcode" value="https://www.cardmarket.com/en/Magic/Orders/{ID}" size="14mm"></cml-barcode>
// Attributes: type (a bwip-js bcid: code128, code39, ean13, qrcode, datamatrix, pdf417, ...; default code128),
// value, module (width of one bar/module in mm; default 0.25mm = 2 dots at 203 dpi), height (linear codes, mm;
// default 8mm), size (2D codes: total width in mm, instead of module), quiet (quiet zone in modules; default 10
// for linear, 4 for 2D), text ("true" = the value under the bars, or your own text).
// The SVG has shape-rendering crispEdges, so the bars stay sharp on a thermal printer. A value that the barcode
// type cannot encode shows a red box with the reason (also on the print: fix the template).
import { toSVG } from '../vendor/bwip-js/bwip-js.mjs';

const TWO_D = /^(qrcode|microqrcode|rectangularmicroqrcode|gs1qrcode|gs1dlqrcode|hibcqrcode|swissqrcode|datamatrix|datamatrixrectangular|datamatrixrectangularextension|gs1datamatrix|gs1datamatrixrectangular|gs1dldatamatrix|hibcdatamatrix|hibcdatamatrixrectangular|azteccode|azteccodecompact|aztecrune|hibcazteccode|maxicode|dotcode|gs1dotcode|hanxin|codeone|ultracode|pdf417|pdf417compact|micropdf417|hibcpdf417|hibcmicropdf417)$/i;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unesc = s => String(s ?? '').replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));
const mm = (v, dflt) => { const m = String(v ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*$/i); return m ? +m[1] : dflt; };
const attrs = s => Object.fromEntries([...s.matchAll(/([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map(m => [m[1].toLowerCase(), unesc(m[2] ?? m[3] ?? m[4])]));
const fail = msg => `<span class="cml-barcode-error" style="display:inline-block;border:0.3mm dashed #c00;color:#c00;font:400 2.2mm/1.2 sans-serif;padding:0.5mm 1mm;white-space:normal">barcode: ${esc(msg)}</span>`;

export function barcodeSvg(a) {
  const type = (a.type || 'code128').toLowerCase(), value = a.value ?? '';
  if (!value) return fail('no value');
  const twoD = TWO_D.test(type);
  let svg;
  try { svg = toSVG({ bcid: type, text: value, scale: 1 }); }
  catch (e) { return fail(String(e?.message || e).replace(/^bwipp\.\w+#\d+:\s*/, '')); }
  const [, , vbW, vbH] = (svg.match(/viewBox="([^"]+)"/)?.[1] || '0 0 0 0').split(/\s+/).map(Number);
  const modules = vbW / 2;                           // bwip-js at scale 1: 2 units per module
  let w = a.size ? mm(a.size, 14) : modules * mm(a.module, 0.25);
  let h = twoD ? (a.height ? mm(a.height, w) : w * vbH / vbW) : mm(a.height, 8);
  const quiet = (+a.quiet >= 0 && a.quiet !== '' ? +a.quiet : twoD ? 4 : 10) * (w / modules);
  svg = svg.replace('<svg ', `<svg width="${w.toFixed(3)}mm" height="${h.toFixed(3)}mm" shape-rendering="crispEdges"${twoD && !a.height ? '' : ' preserveAspectRatio="none"'} style="display:block" `);
  const text = a.text === 'true' ? value : a.text && a.text !== 'false' ? a.text : '';
  return `<span class="cml-barcode" style="display:inline-block;vertical-align:top;line-height:0;padding:0 ${quiet.toFixed(3)}mm">${svg}${text ? `<span style="display:block;margin-top:0.4mm;font:400 2.4mm/1.2 Consolas, 'Courier New', monospace;text-align:center;white-space:nowrap">${esc(text)}</span>` : ''}</span>`;
}

// Replace every <cml-barcode ...></cml-barcode> (or <cml-barcode .../>) in filled template HTML.
export const expandBarcodes = html => html.replace(/<cml-barcode\b([^>]*?)\/?>(?:\s*<\/cml-barcode>)?/gi, (_, a) => barcodeSvg(attrs(a)));
