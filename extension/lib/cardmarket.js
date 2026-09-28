// Cardmarket: normal page loads in hidden tabs, read by content/cm.js. No fetch(): bulk fetches from an
// extension got a profile blocked by Cloudflare's WAF, while page loads a few at a time look like browsing.
// The list tab reads the list page(s); three worker tabs read the sale pages with a short pause between pages.
// At the first block page the whole run stops.
import { Tab, sleep } from './tabs.js';

export const BASE = 'https://www.cardmarket.com/en/Magic';
export const LISTS = {
  Paid: { path: '/Orders/Sales/Paid', query: 'presaleStatus=2', allPages: true },   // incl. presale; all pages
};
const listUrl = (list, page = 1) => {
  const l = LISTS[list];
  const qs = [l.query, page > 1 ? `site=${page}` : ''].filter(Boolean).join('&');
  return BASE + l.path + (qs ? '?' + qs : '');
};
const WORKERS = 3;                                   // sale pages loading at the same time
const pause = () => sleep(500);                      // between two page loads of one tab

class Blocked extends Error {}

// Load url in the tab and wait until the page is usable: ready, past Cloudflare's normal check, and
// done(state) true (when given). A block page throws Blocked.
async function loadPage(tab, url, done = () => true, ms = 60000) {
  await tab.navigate(url);
  for (const t = Date.now(); ; await sleep(400)) {
    const s = await tab.safe('state', null);
    if (s?.block) throw new Blocked(`Cloudflare blocked this browser on Cardmarket (${url}). The run stopped; wait a while before you try again.`);
    if (s && s.ready === 'complete' && !s.check && s.url.startsWith(url.split('?')[0]) && await done(s)) return s;
    if (Date.now() - t > ms) throw new Error(`Cardmarket page did not load within ${ms / 1000} s: ${url}`);
  }
}

// onProgress(done, total): after every sale page (for a progress bar); the log gets a line every 10.
// only: sale ids (10 digits). When given, only those sale pages are read, not the ids on the list pages (the
// first list page still loads, for the login check).
export async function loadSales(list, { log, onLogin, windowId, onProgress = () => {}, only = null }) {
  const tab = await Tab.open('about:blank', { file: 'content/cm.js', ns: '__cmlCM', windowId });
  const workers = [];
  try {
    let s = await loadPage(tab, listUrl(list));
    if (!s.loggedIn) {
      log('Not logged in to Cardmarket: log in in the Cardmarket tab. The run continues by itself.');
      onLogin(true);
      await tab.activate();
      // check the page in that tab; no reloads while you type
      while (!(s = await tab.safe('state', null))?.loggedIn) {
        if (s?.block) throw new Blocked('Cloudflare blocked this browser on Cardmarket. The run stopped.');
        await sleep(3000);
      }
      onLogin(false);
      log('Logged in.');
      await pause();
      s = await loadPage(tab, listUrl(list), st => st.loggedIn);
    }
    let ids;
    if (only?.length) {
      ids = [...new Set(only)];
      log(`${ids.length} chosen sale(s): ${ids.join(', ')}. Reading the sale pages, ${WORKERS} at a time...`);
    } else {
      const first = await tab.call('list');
      ids = first.ids;
      const pages = LISTS[list].allPages ? first.pages : 1;
      for (let p = 2; p <= pages; p++) {
        await pause();
        await loadPage(tab, listUrl(list, p), st => st.url.includes(`site=${p}`));
        ids = [...new Set(ids.concat((await tab.call('list')).ids))];
      }
      log(`${list}: ${ids.length} sale(s)${LISTS[list].allPages ? ` on ${pages} page(s)` : ' on page 1'}. Reading the sale pages, ${WORKERS} at a time...`);
    }

    const t = Date.now(), out = []; let next = 0, stop = null;
    onProgress(0, ids.length);
    workers.push(tab);
    for (let i = 1; i < Math.min(WORKERS, ids.length); i++) workers.push(await Tab.open('about:blank', { file: 'content/cm.js', ns: '__cmlCM', windowId }));
    await Promise.all(workers.map(async w => {
      while (!stop && next < ids.length) {
        const id = ids[next++];
        await pause();
        try {
          await loadPage(w, `${BASE}/Orders/${id}`, () => w.safe('hasSale', false, id), 45000);
          out.push(await w.call('sale', id));
        } catch (e) {
          if (e instanceof Blocked) { stop = e; break; }
          out.push({ id, error: e.message });
        }
        onProgress(out.length, ids.length);
        if (out.length % 10 === 0) log(`  ${out.length}/${ids.length} sale pages read`);
      }
    }));
    if (stop) throw stop;
    log(`Read ${out.length} sale page(s) in ${((Date.now() - t) / 1000).toFixed(1)} s.`);
    const order = new Map(ids.map((id, i) => [id, i]));
    return out.sort((a, b) => order.get(a.id) - order.get(b.id));
  } finally {
    for (const w of new Set([tab, ...workers])) await w.close();
  }
}
