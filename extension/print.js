// Print page for the panel in the Cardmarket page (Cardmarket's own page cannot host our print frame): it shows
// the labels of the print job (one per page, or on sheets), opens the print dialog and closes itself afterwards. The panel
// opens it only after your click on Print, and only after a load of the Paid list.
import { ext } from './lib/ext.js';
import { pagesHtml, printCss, paper, fitLabels, isSheet, printSummary, mm } from './lib/labels.js';

const { printJob: job } = await ext.storage.local.get('printJob');
await ext.storage.local.remove('printJob');
if (!job || Date.now() - job.at > 60000) {
  document.body.textContent = 'No print job (or it is older than a minute). Click Print in the panel again.';
} else {
  const s = job.settings;
  const pg = paper(s);
  document.querySelector('#page').textContent = `
    ${printCss(s)}
    @media screen { body { background: #888; padding: 12px; } .cml-page { margin: 0 auto 12px; box-shadow: 0 1px 4px #0006; background: #fff; }
      .guide { max-width: 560px; margin: 0 auto 16px; background: #fff; color: #1d1f23; border-radius: 8px; padding: 12px 16px; font: 13px/1.5 "Segoe UI", system-ui, sans-serif; }
      .guide b { font-weight: 600; } .guide ul { margin: 6px 0 0; padding-left: 18px; } }
    @media print { .guide { display: none; } }`;
  // shown behind the print dialog, not printed: what to choose there
  const sheet = isSheet(s), size = `${mm(pg.w)} × ${mm(pg.h)} mm`;
  const guide = `<div class="guide"><b>${printSummary(job.orders, s)}.</b> In the print dialog choose:
    <ul><li>Destination: ${sheet ? 'your printer' : 'your label printer'}</li><li>Paper size: <b>${size}</b>${pg.r ? ` (the label is turned ${pg.r}° on it)` : ''}</li><li>Margins: <b>None</b>, Scale: <b>100%</b>, Headers and footers: <b>off</b></li></ul>
    <p style="margin:8px 0 0">Is that paper size not in the list? The browser can only choose sizes that the printer driver offers: add a
    ${size} paper size to the printer (printer preferences, or Windows "Print server properties" &gt; Forms), then print again.</p></div>`;
  document.title = `cm-labels ${mm(pg.w)}x${mm(pg.h)} mm`;
  document.body.innerHTML = guide + pagesHtml(job.orders, s);
  try { await document.fonts.ready; } catch { }
  fitLabels(document);
  addEventListener('afterprint', () => window.close(), { once: true });
  print();
}
