// One WebExtension API for Chromium and Firefox, for extension pages and for content scripts.
// Firefox has browser.* (promises), Chromium chrome.* (promises in Manifest V3).
// Content scripts (the panel in the Cardmarket page) have no tabs/scripting/windows API: there the same calls go
// through the background script (background.js, message 'cml-rpc'), which runs them and answers. So the run code
// (lib/cardmarket.js, lib/postnl.js) is the same in the app page and in the Cardmarket page.
const raw = globalThis.browser ?? globalThis.chrome;
export const isContentScript = !raw.tabs;

async function rpc(op, ...args) {
  const r = await raw.runtime.sendMessage({ cml: 'rpc', op, args });
  if (!r) throw new Error(`no answer from the extension for ${op}`);
  if (!r.ok) throw new Error(r.e);
  return r.v;
}
const via = ops => Object.fromEntries(ops.map(([ns, name]) => [name, (...a) => rpc(`${ns}.${name}`, ...a)]));

export const ext = isContentScript ? {
  runtime: raw.runtime,
  storage: raw.storage,
  tabs: via([['tabs', 'create'], ['tabs', 'update'], ['tabs', 'get'], ['tabs', 'remove'], ['tabs', 'reload'], ['tabs', 'group'], ['tabs', 'ungroup'], ['tabs', 'getCurrent']]),
  tabGroups: via([['tabGroups', 'update']]),
  windows: via([['windows', 'update']]),
} : raw;

// Runs a function of a content-script library (window[ns]) in a tab; { missing: true } when the tab's document
// does not have it yet. The same function is in background.js for the content-script case.
export const inTab = (ns, name, args) => {
  const lib = globalThis[ns];
  if (!lib) return { missing: true };
  try { return Promise.resolve(lib[name](...args)).then(v => ({ ok: true, v }), e => ({ ok: false, e: String(e?.message || e) })); }
  catch (e) { return { ok: false, e: String(e?.message || e) }; }
};
export async function callInTab(tabId, ns, name, args) {
  if (isContentScript) return rpc('callInTab', tabId, ns, name, args);
  const [r] = await raw.scripting.executeScript({ target: { tabId }, func: inTab, args: [ns, name, args] });
  return r?.result;
}
export async function injectFile(tabId, file) {
  if (isContentScript) return rpc('injectFile', tabId, file);
  await raw.scripting.executeScript({ target: { tabId }, files: [file] });
}
export const openPage = (page, { reuse = true } = {}) => rpc('openPage', page, reuse);
