// Print page for the panel in the Cardmarket page (Cardmarket's own page cannot host our print frame): it shows
// the labels of the print job (one per page, or on sheets), opens the print dialog and closes itself afterwards.
import { ext } from './lib/ext.js';
import { pagesHtml, printCss, paper, fitLabels, isSheet, isRoll, feedOf, printSummary, mm } from './lib/labels.js';
import { getSettings } from './lib/store.js';
import { t, setLang, resolveLang, applyI18n } from './lib/messages.js';

setLang(resolveLang((await getSettings()).uiLang, navigator.language));
applyI18n(document);

const { printJob: job } = await ext.storage.local.get('printJob');
await ext.storage.local.remove('printJob');
if (!job || Date.now() - job.at > 60000) {
  document.body.textContent = t('printpage.none');
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
  const guide = `<div class="guide">${t('printpage.choose', { summary: printSummary(job.orders, s) })}
    <ul><li>${sheet ? t('printpage.destSheet') : isRoll(s) ? t('printpage.destRoll') : t('printpage.destLabel')}</li><li>${t('printpage.paper', { size })}${pg.r ? t('printpage.turned', { r: pg.r }) : ''}${feedOf(s) ? t('printpage.feed', { feed: mm(feedOf(s)) }) : ''}</li><li>${t('printpage.margins')}</li></ul>
    <p style="margin:8px 0 0">${t('printpage.missing', { size })}</p></div>`;
  document.title = `cm-labels ${mm(pg.w)}x${mm(pg.h)} mm`;
  document.body.innerHTML = guide + pagesHtml(job.orders, s);
  try { await document.fonts.ready; } catch { }
  fitLabels(document);
  addEventListener('afterprint', () => window.close(), { once: true });
  print();
}
