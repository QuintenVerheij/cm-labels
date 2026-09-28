# cm-labels

Browser extension that turns Cardmarket sales into shipping labels and a PostNL cart: stamp codes, tracked labels and address labels. It never pays.

Works in Chromium browsers (Chrome, Brave, Edge) and Firefox.

## Layout

- `extension/` - the extension itself (load this folder unpacked).
- `tools/` - build scripts: `build-data.mjs`, `icons.mjs`, `pack.mjs`, `sign.mjs`, `ext-test.mjs`.
- `methods.psd1`, `countries.psd1`, `shipping-costs.csv`, `shipping-costs/` - data sources for `extension/data/*.json`.
- `cdp/config.mjs` - config loader used by `build-data.mjs`.

## Build

```
node tools/build-data.mjs   # regenerate extension/data/*.json
node tools/pack.mjs         # write dist/cm-labels-<version>.zip and .xpi
```

Firefox signing: set `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`, then run `node tools/sign.mjs`.
