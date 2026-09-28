// Background script. Classic script: a Chromium service worker and a Firefox background page (MV3 event page)
// both run it.
// 1. Toolbar button: show the app page.
// 2. Relay for the panel in the Cardmarket page: content scripts have no tabs/scripting/windows API, so the panel
//    sends those calls here ('cml' rpc) and gets the result. Only the calls listed in OPS are allowed. Every call
//    also keeps a service worker awake while a run goes.
const ext = globalThis.browser ?? globalThis.chrome;

async function openPage(page, reuse = true) {
  const url = ext.runtime.getURL(page);
  const [open] = reuse ? await ext.tabs.query({ url }) : [];
  if (open) {
    await ext.tabs.update(open.id, { active: true });
    await ext.windows.update(open.windowId, { focused: true });
    if (page.startsWith('app.html')) await ext.tabs.reload(open.id);   // show the latest run
    return open.id;
  }
  return (await ext.tabs.create({ url })).id;
}
ext.action.onClicked.addListener(() => openPage('app.html'));

// Same function as inTab in lib/ext.js: runs window[ns][name](...args) in the tab.
const inTab = (ns, name, args) => {
  const lib = globalThis[ns];
  if (!lib) return { missing: true };
  try { return Promise.resolve(lib[name](...args)).then(v => ({ ok: true, v }), e => ({ ok: false, e: String(e?.message || e) })); }
  catch (e) { return { ok: false, e: String(e?.message || e) }; }
};
const FILES = ['content/cm.js', 'content/pnl.js'];
const OPS = {
  'tabs.create': (s, a) => ext.tabs.create(...a),
  'tabs.update': (s, a) => ext.tabs.update(...a),
  'tabs.get': (s, a) => ext.tabs.get(...a),
  'tabs.remove': (s, a) => ext.tabs.remove(...a),
  'tabs.reload': (s, a) => ext.tabs.reload(...a),
  'tabs.group': (s, a) => ext.tabs.group(...a),
  'tabs.ungroup': (s, a) => ext.tabs.ungroup?.(...a),
  'tabs.getCurrent': s => s.tab,
  'tabGroups.update': (s, a) => ext.tabGroups.update(...a),
  'windows.update': (s, a) => ext.windows.update(...a),
  callInTab: async (s, [tabId, ns, name, args]) => (await ext.scripting.executeScript({ target: { tabId }, func: inTab, args: [ns, name, args] }))[0]?.result,
  injectFile: async (s, [tabId, file]) => { if (!FILES.includes(file)) throw new Error(`not an injectable file: ${file}`); await ext.scripting.executeScript({ target: { tabId }, files: [file] }); },
  openPage: (s, [page, reuse]) => { if (!/^(app|print)\.html(\?|$)/.test(page)) throw new Error(`not an extension page: ${page}`); return openPage(page, reuse); },
};
ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.cml !== 'rpc' || sender.id !== ext.runtime.id) return;
  const op = OPS[msg.op];
  if (!op) { sendResponse({ ok: false, e: `not allowed: ${msg.op}` }); return; }
  Promise.resolve().then(() => op(sender, msg.args || [])).then(v => sendResponse({ ok: true, v: v ?? null }), e => sendResponse({ ok: false, e: String(e?.message || e) }));
  return true;   // answer comes later
});
