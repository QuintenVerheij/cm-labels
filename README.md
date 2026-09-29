# cm-labels

Browser extension that turns Cardmarket sales into shipping labels and a PostNL cart: stamp codes, tracked labels and address labels. It never pays.

Works in Chromium browsers (Chrome, Brave, Edge; Chrome 121 or later) and Firefox 140 or later on the desktop. Firefox for Android is not supported.

The button appears on any Orders page of Cardmarket. On other pages the panel shows a message that it works only on the English Magic pages (`https://www.cardmarket.com/en/Magic/...`). Other languages and other games are not read.

May at some point support other postal services.

## Install

Load `extension/` unpacked (Chromium: `chrome://extensions`, Developer mode; Firefox: `about:debugging`, Load Temporary Add-on), or install a packed build from `dist/` (see Build).

Firefox lets the user switch off the host permissions for Cardmarket and PostNL. When Cardmarket's is missing, the extension page shows a banner with a button that asks for it again, together with the shop of the seller's own carrier. The Deutsche Post shop is an optional permission in both browsers. A carrier's shop is asked for when you click the cart button, and only the shops of the carriers in that cart are asked for. The panel in the Cardmarket page cannot ask for a permission: when a shop is missing there, add to the cart once from the full page.

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

The tools run on Windows and macOS.

- `build-data.mjs` needs PowerShell: `cdp/config.mjs` runs `powershell.exe` on Windows and `pwsh` elsewhere to read the `.psd1` files. On macOS: `brew install powershell`. The JSON keys are sorted, so every platform writes the same files. The data tests in `npm test` run it too.
- `pack.mjs` needs the system's own bsdtar: `tar.exe` from the Windows System32 folder (Windows 10 1803 or later) or `/usr/bin/tar` on macOS.
- `icons.mjs` needs Google Chrome in its default place: `%ProgramFiles%\Google\Chrome\Application` on Windows, `/Applications/Google Chrome.app` on macOS.
- `ext-test.mjs` is a manual driver, not part of `npm test`. It needs the same Chrome install, and Cardmarket and PostNL logged in in the profile `cm-labels/chrome-cdp` under `%LOCALAPPDATA%` (Windows) or `~/Library/Application Support` (macOS).
- `sign.mjs` runs on any platform with Node and npm; it fetches `web-ext` through `npx`.

The `.xpi` from `pack.mjs` is unsigned and is the same archive as the `.zip`. Release Firefox refuses an unsigned add-on except as a temporary add-on. To get a signed `.xpi`, set `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` (from the addons.mozilla.org API key page), then run `node tools/sign.mjs`. It signs as an unlisted add-on and writes the signed file to `dist/`; each upload needs a new `version` in `extension/manifest.json`.

## Settings

- **Label printer, die-cut or continuous roll.** On a continuous roll the label height is the cut length, and a feed adds blank space after each label so the cut does not touch the text. The cut itself is a setting of the printer driver: choose the roll and the cut after each label there. To cut along the other side, turn the label with the rotation.
- **Images and fonts in the layout.** Upload an image (PNG, JPG, GIF, WebP, BMP or SVG) or a font (TTF, OTF, WOFF or WOFF2). An image is made black and white with one pixel for each printer dot, with a threshold and an optional dither. Use it as `<img src="asset:name">`. Use a font by its name in `font-family`. Together they may take 2 MB of the browser's storage.

## The Run tab

After a load, a table lists every order with its number, last name, country, quantity, article value and total. The Delete button takes an order out of the run, and the breakdown, the address labels and the cart choices follow at once. Loading the paid orders again replaces all of them.

## Shipping rules

- An untracked (stamp) sale with an article value of 25 or more is skipped and left for you to check. So is one whose value cannot be read from the page.
- Stamp codes come in two weights: up to 20 g and up to 50 g. A sale over 50 g, or without a weight, gets its label printed and its stamp left to buy by hand.
- Tracked sales are matched to a PostNL product and option through `methods.psd1`; the smallest PostNL weight band that holds the weight in the method name is chosen.

## Licence

MIT. See `LICENSE`. The bundled `extension/vendor/bwip-js` keeps its own licence in `extension/vendor/bwip-js/LICENSE`.
