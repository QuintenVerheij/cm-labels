// Injected into a Cardmarket tab (isolated world). Reads only the page that is loaded in this tab: no fetch().
// (Bulk fetch() of sale pages from an extension got a browser profile blocked by Cloudflare's WAF; normal page
// loads, a few at a time, look like normal browsing.)
(() => {
  if (window.__cmlCM) return;
  const T = e => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
  const head = () => document.title + ' ' + (document.body?.innerText || '').slice(0, 600);

  // Cloudflare localises its pages, so the markup decides and the English text is only a fallback.
  // 'block' = Cloudflare refused this browser (stop everything); 'limited' = rate limit page (429);
  // 'check' = the normal "Just a moment" check.
  const has = sel => !!document.querySelector(sel);
  const isBlock = h => has('#cf-wrapper') || has('#cf-error-details')
    || /Attention Required|Sorry, you have been blocked|Access denied|Error 10\d\d/i.test(h);
  const isLimited = h => /Too Many Requests|Error 429|HTTP ERROR 429/i.test(h);
  const isCheck = h => has('#challenge-form') || has('#challenge-running') || has('#challenge-stage') || has('[id^="cf-chl"]')
    || (has('script[src*="/cdn-cgi/challenge-platform"]') && (document.body?.innerText || '').trim().length < 200)
    || /Just a moment|Performing security verification|Verify you are human/i.test(h);

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
    const m = (document.body.textContent.match(/Page \d+ of (\d+)/) || [])[1];
    return { ids, pages: m ? +m : 1 };
  }

  // The loaded sale page -> the fields the plan needs. The shipping blocks are Bootstrap collapses: read the
  // elements, not the visible text (closed sections have no innerText).
  function sale(id) {
    const doc = document;
    if (!doc.querySelector('#ShippingAddress')) return { id, error: 'no shipping address on the page' };
    const lines = [...doc.querySelectorAll('#ShippingAddress > div')].map(d => ({ kind: d.className, text: T(d) })).filter(x => x.text);
    const info = {};
    const dts = [...doc.querySelectorAll('#collapsibleOtherInfo dt')];
    for (const dt of dts) info[T(dt).replace(/:$/, '')] = dt.nextElementSibling;
    const md = info['Shipping Method'];
    const spans = md ? [...md.querySelectorAll(':scope > span')] : [];
    const methodName = T(spans.find(s => !s.classList.contains('text-muted')));
    const max = T(spans.find(s => s.classList.contains('text-muted')));
    const grams = (max.match(/max\.?\s*(\d+)\s*g/i) || [])[1];
    const flags = md ? T(md.querySelector('div')) : '';
    const all = dts.map(dt => T(dt.nextElementSibling)).join(' ');
    const mailDd = Object.entries(info).find(([k]) => /mail/i.test(k))?.[1];
    const mail = /[^@\s:<>()]+@[^@\s:<>()]+\.[A-Za-z]{2,}/;
    const email = (T(mailDd).match(mail) || all.match(mail) || [])[0] || null;
    const sum = doc.querySelector('[data-item-value]');
    return {
      id, lines, methodName, method: (methodName + max).trim(), grams: grams ? +grams : null,
      tracked: md ? !/No tracking/i.test(flags) : null, trackingCode: T(info['Tracking Code']) || null,
      phone: T(info['Phone Number']) || null, email,
      value: sum ? +sum.getAttribute('data-item-value') : null, articles: sum ? +sum.getAttribute('data-article-count') : null,
    };
  }

  window.__cmlCM = { state, list, sale, hasSale: id => document.body?.textContent.includes('Sale #' + id) && !!document.querySelector('#ShippingAddress') };
})();
