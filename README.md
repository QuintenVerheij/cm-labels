# cm-labels

Browser extension that turns Cardmarket sales into shipping labels and a PostNL cart: stamp codes, tracked labels and address labels. It never pays.

Works in Chromium browsers (Chrome, Brave, Edge; Chrome 121 or later) and Firefox 140 or later on the desktop. Firefox for Android is not supported.

The button appears on any Orders page of Cardmarket. On other pages the panel shows a message that it works only on the English Magic pages (`https://www.cardmarket.com/en/Magic/...`). Other languages and other games are not read.

May at some point support other postal services.

## Install

Load `extension/` unpacked (Chromium: `chrome://extensions`, Developer mode; Firefox: `about:debugging`, Load Temporary Add-on), or install a packed build from `dist/` (see Build).

Firefox lets the user switch off the host permissions for Cardmarket and PostNL. When they are missing, the extension page shows a banner with a button that asks for them again.

## Layout

- `extension/` - the extension itself.
- `tools/` - build and test scripts: `build-data.mjs`, `icons.mjs`, `pack.mjs`, `sign.mjs`, `ext-test.mjs`.
- `methods.psd1`, `countries.psd1`, `shipping-costs.csv` - data sources for `extension/data/*.json`.
- `shipping-costs/` - one text file per country with Cardmarket's shipping table. Reference copies only: no tool reads them. `shipping-costs.csv` is the only rate input of the data build; edit it directly.
- `cdp/config.mjs` - loads the two `.psd1` files for `build-data.mjs`.
- `test/` - the unit tests.
- `extension/vendor/bwip-js/` - vendored barcode library; `SOURCE.txt` records its version and checksums.

## Scripts

Node 22 or later.

```
npm test        # run the unit tests (node --test test/**/*.test.mjs)
npm run build   # node tools/build-data.mjs: regenerate extension/data/*.json
npm run pack    # node tools/pack.mjs: write dist/cm-labels-<version>.zip and .xpi
```

`node tools/build-data.mjs --check` writes nothing and exits 1 when `extension/data` differs from the sources or the CSV has a duplicated rate row.

### What each tool needs

- `build-data.mjs` needs Windows PowerShell: `cdp/config.mjs` runs `powershell.exe` to read the `.psd1` files.
- `pack.mjs` needs Windows: it calls `tar.exe` from the Windows System32 folder (Windows 10 1803 or later).
- `icons.mjs` needs Windows and Google Chrome in `%ProgramFiles%\Google\Chrome\Application`.
- `ext-test.mjs` is a manual driver, not part of `npm test`. It needs the same Chrome install, and Cardmarket and PostNL logged in in the profile `%LOCALAPPDATA%\cm-labels\chrome-cdp`.
- `sign.mjs` runs on any platform with Node and npm; it fetches `web-ext` through `npx`.

The `.xpi` from `pack.mjs` is unsigned and is the same archive as the `.zip`. Release Firefox refuses an unsigned add-on except as a temporary add-on. To get a signed `.xpi`, set `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` (from the addons.mozilla.org API key page), then run `node tools/sign.mjs`. It signs as an unlisted add-on and writes the signed file to `dist/`; each upload needs a new `version` in `extension/manifest.json`.

## Shipping rules

- An untracked (stamp) sale with an article value of 25 or more is skipped and left for you to check. So is one whose value cannot be read from the page.
- Stamp codes come in two weights: up to 20 g and up to 50 g. A sale over 50 g, or without a weight, gets its label printed and its stamp left to buy by hand.
- Tracked sales are matched to a PostNL product and option through `methods.psd1`; the smallest PostNL weight band that holds the weight in the method name is chosen.
