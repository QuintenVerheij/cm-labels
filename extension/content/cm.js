// Injected into a Cardmarket tab (isolated world). Reads only the page that is loaded in this tab: no fetch().
// (Bulk fetch() of sale pages from an extension got a browser profile blocked by Cloudflare's WAF; normal page
// loads, a few at a time, look like normal browsing.)
(() => {
  if (window.__cmlCM) return;
  const T = e => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
  const head = () => document.title + ' ' + (document.body?.innerText || '').slice(0, 600);

  // The texts read from a Cardmarket page, per language of the page (the /en/ or /de/ of its URL). A page is read
  // with its own language first and English second, so a page in either language still parses.
  // Entries marked (guess) are best guesses for the German page: no German seller page was available to check them.
  const LABELS = {
    en: {
      block: /Attention Required|Sorry, you have been blocked|Access denied|Error 10\d\d/i,
      limited: /Too Many Requests|Error 429|HTTP ERROR 429/i,
      check: /Just a moment|Performing security verification|Verify you are human/i,
      pages: /Page \d+ of (\d+)/,
      method: /^Shipping Method$/i,
      max: /max\.?\s*(\d{1,3}(?:[,.]\d{3})+|\d+)\s*g/i,
      mail: /mail/i,
      noTracking: /No tracking/i,
      trackingCode: /^Tracking Code$/i,
      phone: /^Phone Number$/i,
      saleNo: ['Sale #'],
      summary: /Article Value\s*(\d[\d.]*,\d{2})\s*€\s*Shipping\s*(\d[\d.]*,\d{2})\s*€\s*Total\s*(\d[\d.]*,\d{2})\s*€/i,
    },
    de: {
      block: /Attention Required|Sorry, you have been blocked|Access denied|Error 10\d\d/i,   // as served on /de/
      limited: /Zu viele Anfragen/i,                                                     // (guess)
      check: /Einen Moment|Sicherheitsüberprüfung|Bestätigen Sie, dass Sie ein Mensch sind/i,   // (guess)
      pages: /Seite \d+ von (\d+)/,                                                      // (guess)
      method: /^Versandart$/i,                                                           // (guess)
      max: /max(?:\.|imal)?\s*(\d{1,3}(?:[,.]\d{3})+|\d+)\s*g/i,                          // (guess)
      mail: /mail/i,                                                                     // (guess) "E-Mail"
      noTracking: /Keine Sendungsverfolgung|Kein Tracking|Ohne Tracking/i,               // (guess)
      trackingCode: /^(?:Sendungsnummer|Tracking-?Code)$/i,                              // (guess)
      phone: /^Telefonnummer$/i,                                                         // (guess)
      saleNo: ['Verkauf #', 'Bestellung #'],                                             // (guess)
      summary: /Artikelwert\s*(\d[\d.]*,\d{2})\s*€\s*Versand\s*(\d[\d.]*,\d{2})\s*€\s*(?:Gesamtsumme|Gesamt|Summe)\s*(\d[\d.]*,\d{2})\s*€/i,   // (guess)
    },
  };
  const lang = () => (location.href.match(/cardmarket\.com\/(en|de)\//) || [])[1] || 'en';
  const labels = () => [...new Set([LABELS[lang()], LABELS.en])];
  const firstMatch = (key, text) => { for (const l of labels()) { const m = text.match(l[key]); if (m) return m; } return null; };

  // Cloudflare's markup decides; its text is only a fallback, read with the page's own language and English.
  // 'block' = Cloudflare refused this browser (stop everything); 'limited' = rate limit page (429);
  // 'check' = the normal "Just a moment" check.
  const has = sel => !!document.querySelector(sel);
  const isBlock = h => has('#cf-wrapper') || has('#cf-error-details') || labels().map(l => l.block).some(r => r.test(h));
  const isLimited = h => labels().map(l => l.limited).some(r => r.test(h));
  const isCheck = h => has('#challenge-form') || has('#challenge-running') || has('#challenge-stage') || has('[id^="cf-chl"]')
    || (has('script[src*="/cdn-cgi/challenge-platform"]') && (document.body?.innerText || '').trim().length < 200)
    || labels().map(l => l.check).some(r => r.test(h));

  function state() {
    const h = head();
    return {
      ready: document.readyState,
      block: isBlock(h),
      limited: isLimited(h),
      check: isCheck(h),
      loggedIn: !!document.querySelector('a[href*="User_Logout"]'),
      url: location.href,
    };
  }

  function list() {
    const ids = [...new Set([...document.querySelectorAll('div[data-url*="/Orders/"]')].map(d => (d.getAttribute('data-url').match(/Orders\/(\d{10})/) || [])[1]).filter(Boolean))];
    const m = (firstMatch('pages', document.body.textContent) || [])[1];
    // A pager without a readable page count: null, so the caller does not take the page for the only one.
    return { ids, pages: m ? +m : has('a[href*="site="]') ? null : 1 };
  }

  // The loaded sale page -> the fields the plan needs. The shipping blocks are Bootstrap collapses: read the
  // elements, not the visible text (closed sections have no innerText).
  function sale(id) {
    const doc = document;
    if (!doc.querySelector('#ShippingAddress')) return { id, error: 'no shipping address on the page' };
    const lines = [...doc.querySelectorAll('#ShippingAddress > div')].map(d => ({ kind: ['Name', 'Extra', 'Street', 'City', 'Country'].find(k => d.classList.contains(k)) || '', text: T(d) })).filter(x => x.text);
    const info = {};
    const dts = [...doc.querySelectorAll('#collapsibleOtherInfo dt')];
    for (const dt of dts) info[T(dt).replace(/:$/, '')] = dt.nextElementSibling;
    const byLabel = key => Object.entries(info).find(([k]) => labels().some(l => l[key].test(k)))?.[1];
    const md = byLabel('method');
    if (!md) return { id, error: 'shipping method not found on page' };
    const spans = md ? [...md.querySelectorAll(':scope > span')] : [];
    const methodName = T(spans.find(s => !s.classList.contains('text-muted')));
    const max = T(spans.find(s => s.classList.contains('text-muted')));
    const grams = (firstMatch('max', max) || [])[1]?.replace(/[,.]/g, '');
    const flags = md ? T(md.querySelector('div')) : '';
    const all = dts.map(dt => T(dt.nextElementSibling)).join(' ');
    const mailDd = byLabel('mail');
    const mail = /[^@\s:<>()]+@[^@\s:<>()]+\.[A-Za-z]{2,}/;
    const email = (T(mailDd).match(mail) || all.match(mail) || [])[0] || null;
    const sum = doc.querySelector('[data-item-value]');
    // The Summary block reads "Article Value 10,95 € Shipping 1,70 € Total 12,65 €": found by its texts, not its markup.
    const money = s => +s.replace(/\./g, '').replace(',', '.');
    const totals = firstMatch('summary', doc.body?.textContent || '');
    return {
      shipping: totals ? money(totals[2]) : null, total: totals ? money(totals[3]) : null,
      id, lines, methodName, method: (methodName + max).trim(), grams: grams ? +grams : null,
      tracked: md ? !firstMatch('noTracking', flags) : null, trackingCode: T(byLabel('trackingCode')) || null,
      phone: T(byLabel('phone')) || null, email,
      value: sum && Number.isFinite(parseFloat(sum.getAttribute('data-item-value'))) ? +sum.getAttribute('data-item-value') : null, articles: sum ? +sum.getAttribute('data-article-count') : null,
    };
  }

  window.__cmlCM = { state, list, sale, hasSale: id => labels().some(l => l.saleNo.some(n => document.body?.textContent.includes(n + id))) && !!document.querySelector('#ShippingAddress') };
})();
