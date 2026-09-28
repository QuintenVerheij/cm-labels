// Content script on Cardmarket order pages: starts the cm-labels panel on the Paid list and on a single sale page.
// The panel code is an ES module of the extension, loaded with import() (content scripts cannot be modules).
(() => {
  if (window.__cmlPanelStarted) return;
  window.__cmlPanelStarted = true;
  const ext = globalThis.browser ?? globalThis.chrome;
  const saleId = (location.pathname.match(/\/Orders\/(\d{10})(?:[/?#]|$)/) || [])[1] || null;
  // the Paid list only
  const list = (location.pathname.match(/\/Orders\/Sales\/(Paid)(?:[/?#]|$)/) || [])[1] || null;
  if (!saleId && !list) return;
  // A Cloudflare check, a block page or the login page can be served at an Orders URL: no button there.
  const st = globalThis.__cmlCM?.state();
  if (!st || st.check || st.block || !st.loggedIn) return;
  import(ext.runtime.getURL('lib/panel-app.js'))
    .then(m => m.start({ saleId, list }))
    .catch(e => console.warn('cm-labels panel:', e));
})();
