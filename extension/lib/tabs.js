// Work tabs for the app page: hidden (inactive) tabs in a collapsed "cm-labels" tab group, driven through a
// content script (ext.scripting). Replaces the CDP client of the Node version.
import { ext, callInTab, injectFile } from './ext.js';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

let groupId = null;
let groupQueue = Promise.resolve();
// One at a time, so parallel opens find the group the first one created.
const addToGroup = tabId => (groupQueue = groupQueue.then(() => addToGroupNow(tabId)));
async function addToGroupNow(tabId) {
  try {
    if (groupId !== null) { await ext.tabs.group({ tabIds: [tabId], groupId }); return; }
  } catch { groupId = null; }
  try {
    groupId = await ext.tabs.group({ tabIds: [tabId] });
    await ext.tabGroups.update(groupId, { title: 'cm-labels', color: 'blue', collapsed: true });
  } catch { /* groups are only tidiness */ }
}

export class Tab {
  // file: the content script; ns: the global it defines in the isolated world.
  constructor(id, file, ns) { this.id = id; this.file = file; this.ns = ns; this.onPoll = null; this.lastPoll = 0; this.lastError = null; }
  // Optional hook, run at most once per second inside every wait and click loop (PostNL: answer a cookie wall
  // that pops up at any moment).
  async poll() {
    if (!this.onPoll || Date.now() - this.lastPoll < 1000) return;
    this.lastPoll = Date.now();
    try { await this.onPoll(this); } catch { }
  }

  static async open(url, { file, ns, windowId }) {
    const t = await ext.tabs.create({ url, active: false, windowId });
    await addToGroup(t.id);
    return new Tab(t.id, file, ns);
  }

  raw(name, args) { return callInTab(this.id, this.ns, name, args); }
  // Call a content-script function; inject the script first when this document does not have it yet
  // (a new page load starts without it).
  async call(name, ...args) {
    let r = await this.raw(name, args);
    if (r?.missing) { await injectFile(this.id, this.file); r = await this.raw(name, args); }
    if (!r) throw new Error(`no result from ${name}`);
    if (!r.ok) throw new Error(r.e);
    return r.v;
  }
  // Same, but a page that is loading or navigating gives the fallback instead of an error.
  async safe(name, fallback, ...args) { try { return await this.call(name, ...args); } catch (e) { this.lastError = e; return fallback; } }

  async waitFor(cond, ms = 15000, what = JSON.stringify(cond)) {
    this.lastError = null;
    for (const t = Date.now(); ; await sleep(150)) {
      await this.poll();
      if (await this.safe('test', false, cond)) return;
      if (Date.now() - t > ms) throw new Error(`timeout waiting for ${what}${this.lastError ? `: ${this.lastError.message}` : ''}`);
    }
  }
  // Test, click, wait up to 1 s for the result, repeat: a click right after load, before Angular is ready, does
  // nothing. The test comes first in every round, so a click that worked late is never followed by another one.
  async clickUntil(spec, cond, { tries = 15, what = JSON.stringify(spec) } = {}) {
    this.lastError = null;
    for (let i = 0; i < tries; i++) {
      await this.poll();
      if (await this.safe('test', false, cond)) return i;
      await this.safe('click', false, spec);
      for (const t = Date.now(); Date.now() - t < 1000; await sleep(100)) if (await this.safe('test', false, cond)) return i + 1;
    }
    const cause = this.lastError;
    const page = await this.safe('q', '', 'errors');
    throw new Error(`no effect after ${tries} clicks: ${what}${page ? ` (page: ${page})` : ''}${cause ? ` (last error: ${cause.message})` : ''}`);
  }
  // Start a page load and wait until Chrome reports it (status 'loading' or the new URL), so the previous
  // page is never read by mistake.
  async navigate(url) {
    await ext.tabs.update(this.id, { url });
    for (const t = Date.now(); Date.now() - t < 3000; await sleep(50)) {
      const s = await ext.tabs.get(this.id);
      if (s.status === 'loading' || (s.pendingUrl || s.url) === url) break;
    }
  }
  // Reload and wait for the new document: first 'loading', then 'complete', so the old page is never read.
  async reload() {
    await ext.tabs.reload(this.id);
    for (const t = Date.now(); Date.now() - t < 3000; await sleep(50)) if ((await ext.tabs.get(this.id)).status === 'loading') break;
    for (const t = Date.now(); Date.now() - t < 20000; await sleep(100)) if ((await ext.tabs.get(this.id)).status === 'complete') return;
  }
  async activate() { const t = await ext.tabs.update(this.id, { active: true }); await ext.windows.update(t.windowId, { focused: true }); }
  async close() { try { await ext.tabs.remove(this.id); } catch { } }
}
