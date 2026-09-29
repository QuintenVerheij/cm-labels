// Cardmarket: normal page loads in hidden tabs, read by content/cm.js. No fetch(): bulk fetches from an
// extension got a profile blocked by Cloudflare's WAF, while page loads a few at a time look like browsing.
// The list tab reads the list pages; three worker tabs read the sale pages with a short pause between pages.
// At the first block or rate-limit page the whole run stops, and so does a run whose sale pages time out
// three times in a row on a challenge or an unknown page.
import { Tab, sleep } from './tabs.js';
import { ext } from './ext.js';
import { LANGS } from './locale.js';
import { count } from './messages.js';
const tabGone = async tab => { try { await ext.tabs.get(tab.id); return false; } catch { return true; } };

// The hosts loading sales needs: the only ones the app page requires before Load (a cart asks for its shops).
export const ORIGINS = ['https://www.cardmarket.com/*'];
const baseFor = lang => `https://www.cardmarket.com/${lang}/Magic`;
// Language and game base of a Cardmarket path ('/de/Pokemon/Orders/1' -> '.../de/Pokemon'); null for any other path.
export const baseFromPath = path => {
  const m = String(path).match(/^\/([A-Za-z]{2})\/([^/?#]+)(?:[/?#]|$)/);
  return m ? `https://www.cardmarket.com/${m[1]}/${m[2]}` : null;
};
// The only pages the code can read: Magic, in a language content/cm.js has labels for.
export const isReadablePath = path => LANGS.some(l => baseFromPath(path) === baseFor(l));
export const LISTS = {
  Paid: { path: '/Orders/Sales/Paid', query: 'presaleStatus=2' },   // incl. presale
};
const listUrl = (list, page = 1, lang = 'en') => {
  const l = LISTS[list];
  const qs = [l.query, page > 1 ? `site=${page}` : ''].filter(Boolean).join('&');
  return baseFor(lang) + l.path + (qs ? '?' + qs : '');
};
// content/panel.js does not start in a tab whose URL ends in this
const WORKER_HASH = '#cml-worker';
const WORKERS = 3;                                   // sale pages loading at the same time
const pause = () => sleep(500);                      // between two page loads of one tab

class Blocked extends Error {}
// A page that never became usable; stuck: the last state was a challenge or not the page asked for.
class PageTimeout extends Error { constructor(msg, stuck) { super(msg); this.stuck = stuck; } }
const STUCK_LIMIT = 3;                               // stuck timeouts in a row that stop the run

// Load url in the tab and wait until the page is usable: ready, past Cloudflare's normal check, and
// done(state) true (when given). A block or rate-limit page throws Blocked. A loaded page that says logged
// out returns at once, at whatever URL. A loaded page that stays not done for a while throws missing (when
// given) instead of waiting out ms.
async function loadPage(tab, url, done = () => true, ms = 60000, missing = null) {
  await tab.navigate(url);
  const here = s => s.url.startsWith(url.split('?')[0]);
  let s = null, seen = 0;
  for (const t = Date.now(); ; await sleep(400)) {
    s = await tab.safe('state', null);
    if (s?.block) throw new Blocked(`Cloudflare blocked this browser on Cardmarket (${url}). The run stopped; wait a while before you try again.`);
    if (s?.limited) throw new Blocked(`Cardmarket answered "Too Many Requests" (${url}). The run stopped; wait a while before you try again.`);
    if (s && s.ready === 'complete' && !s.check && !s.loggedIn) return s;
    if (s && s.ready === 'complete' && !s.check && here(s) && await done(s)) return s;
    if (missing && s && s.ready === 'complete' && !s.check && here(s)) {
      seen ||= Date.now();
      if (Date.now() - seen > Math.min(2000, ms / 4)) throw new PageTimeout(missing, false);
    }
    if (Date.now() - t > ms) throw new PageTimeout(`Cardmarket page did not load within ${ms / 1000} s: ${url}`, !s || s.check || !here(s));
  }
}

// onProgress(done, total): after every sale page (for a progress bar); the log gets a line every 10.
// only: sale ids (10 digits). When given, only those sale pages are read, not the ids on the list pages (the
// first list page still loads, for the login check).
export async function loadSales(list, { lang = 'en', log, onLogin = () => {}, windowId, onProgress = () => {}, only = null, saleMs = 45000, loginMs = 600000, loginPollMs = 3000 }) {
  const tab = await Tab.open('about:blank', { file: 'content/cm.js', ns: '__cmlCM', windowId, hash: WORKER_HASH });
  const workers = [];
  try {
    let s = await loadPage(tab, listUrl(list, 1, lang));
    if (!s.loggedIn) {
      log('Not logged in to Cardmarket: log in in the Cardmarket tab. The run continues by itself.');
      onLogin(true);
      await tab.activate();
      // check the page in that tab; no reloads while you type
      for (const t = Date.now(); !(s = await tab.safe('state', null))?.loggedIn; await sleep(loginPollMs)) {
        if (s?.block) throw new Blocked('Cloudflare blocked this browser on Cardmarket. The run stopped.');
        if (await tabGone(tab)) { onLogin(false); throw new Error('The Cardmarket tab was closed before you logged in. Start the run again.'); }
        if (Date.now() - t > loginMs) { onLogin(false); throw new Error(`Not logged in to Cardmarket within ${Math.round(loginMs / 60000)} min. Start the run again.`); }
      }
      onLogin(false);
      log('Logged in.');
      await pause();
      s = await loadPage(tab, listUrl(list, 1, lang), st => st.loggedIn);
    }
    let ids;
    if (only?.length) {
      ids = [...new Set(only)];
      log(`${count(ids.length, 'chosen sale')}: ${ids.join(', ')}. Reading the sale pages, ${WORKERS} at a time...`);
    } else {
      const first = await tab.call('list');
      ids = first.ids;
      if (first.pages == null) log('Warning: the list has more than one page but its page count could not be read. Only page 1 is loaded.');
      const pages = first.pages ?? 1;
      for (let p = 2; p <= pages; p++) {
        await pause();
        await loadPage(tab, listUrl(list, p, lang), st => st.url.includes(`site=${p}`));
        ids = [...new Set(ids.concat((await tab.call('list')).ids))];
      }
      log(`${list}: ${count(ids.length, 'sale')} on ${count(pages, 'page')}. Reading the sale pages, ${WORKERS} at a time...`);
    }

    const t = Date.now(), out = []; let next = 0, stop = null, stuck = 0;
    onProgress(0, ids.length);
    workers.push(tab);
    for (let i = 1; i < Math.min(WORKERS, ids.length); i++) workers.push(await Tab.open('about:blank', { file: 'content/cm.js', ns: '__cmlCM', windowId, hash: WORKER_HASH }));
    await Promise.all(workers.map(async w => {
      while (!stop && next < ids.length) {
        const id = ids[next++];
        await pause();
        try {
          const page = await loadPage(w, `${baseFor(lang)}/Orders/${id}`, () => w.safe('hasSale', false, id), saleMs, `Sale ${id} not found: not your sale or no such order.`);
          if (!page.loggedIn) throw new PageTimeout(`Sale ${id} not read: logged out of Cardmarket.`, false);
          out.push(await w.call('sale', id));
          stuck = 0;
        } catch (e) {
          if (e instanceof Blocked) { stop = e; break; }
          stuck = e.stuck ? stuck + 1 : 0;
          if (stuck >= STUCK_LIMIT) { stop = new Blocked(`${STUCK_LIMIT} Cardmarket pages in a row stayed on a Cloudflare check or an unknown page. The run stopped; wait a while before you try again.`); break; }
          out.push({ id, error: e.message });
        }
        onProgress(out.length, ids.length);
        if (out.length % 10 === 0) log(`  ${out.length}/${ids.length} sale pages read`);
      }
    }));
    if (stop) throw stop;
    log(`Read ${count(out.length, 'sale page')} in ${((Date.now() - t) / 1000).toFixed(1)} s.`);
    const order = new Map(ids.map((id, i) => [id, i]));
    return out.sort((a, b) => order.get(a.id) - order.get(b.id));
  } finally {
    for (const w of new Set([tab, ...workers])) await w.close();
  }
}
