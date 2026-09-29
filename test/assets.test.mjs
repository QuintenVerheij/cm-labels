import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome ??= { tabs: {}, runtime: {}, storage: { local: {} } };
const { toMono, monoToRgba } = await import('../extension/lib/mono.js');
const { kindOf, extOf, slug, uniqueName, validName, totalSize, withAssets, fontFaceCss, snippet, LIMITS } = await import('../extension/lib/assets.js');
const { labelHtml, printCss } = await import('../extension/lib/labels.js');

const px = (...rgba) => Uint8ClampedArray.from(rgba.flat());
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const FONT = 'data:font/ttf;base64,AAEAAAAKAIAAAwAg';
const image = { name: 'logo', kind: 'image', data: PNG, w: 240, h: 80, mm: 30 };
const font = { name: 'my-font', kind: 'font', data: FONT, format: 'truetype' };

test('toMono: black is 1, white is 0, and see-through counts as white paper', () => {
  const bits = toMono(px([0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 0], [255, 0, 0, 255]), 4, 1);
  assert.deepEqual([...bits], [1, 0, 0, 1]);   // red is dark enough (luma 76) for the default threshold
});

test('toMono: the threshold moves the line between black and white', () => {
  const grey = px([128, 128, 128, 255]);
  assert.equal(toMono(grey, 1, 1, { threshold: 40 })[0], 0);
  assert.equal(toMono(grey, 1, 1, { threshold: 60 })[0], 1);
  assert.equal(toMono(grey, 1, 1, { threshold: 0 })[0], 0);
  assert.equal(toMono(grey, 1, 1, { threshold: 100 })[0], 1);
});

test('toMono: dithering turns mid grey into about half black dots, plain thresholding into all or none', () => {
  const n = 32, grey = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) grey.set([128, 128, 128, 255], i * 4);
  const dotted = toMono(grey, n, n, { dither: true }).reduce((a, b) => a + b, 0) / (n * n);
  assert.ok(dotted > 0.4 && dotted < 0.6, `share of black ${dotted}`);
  const flat = toMono(grey, n, n).reduce((a, b) => a + b, 0);
  assert.ok(flat === 0 || flat === n * n);
});

test('monoToRgba gives opaque black and white', () => {
  assert.deepEqual([...monoToRgba(Uint8Array.of(1, 0), 2, 1)], [0, 0, 0, 255, 255, 255, 255, 255]);
});

test('file names give the kind, a safe name and a name that is not taken', () => {
  assert.equal(kindOf('Logo.PNG'), 'image');
  assert.equal(kindOf('a.woff2'), 'font');
  assert.equal(kindOf('notes.txt'), null);
  assert.equal(extOf('archive.tar.gz'), 'gz');
  assert.equal(slug('My Logo (2).PNG'), 'my-logo-2');
  assert.equal(slug('!!!.png'), 'asset');
  assert.equal(slug('x'.repeat(50) + '.png').length, 32);
  assert.equal(uniqueName('logo', [image]), 'logo-2');
  assert.equal(uniqueName('logo', [image, { ...image, name: 'logo-2' }]), 'logo-3');
  assert.equal(uniqueName('fresh', [image]), 'fresh');
  assert.ok(validName('logo_1-a') && !validName('a b') && !validName('') && !validName('x'.repeat(33)));
});

test('the total size counts every stored asset', () => {
  assert.equal(totalSize([image, font]), PNG.length + FONT.length);
  assert.equal(totalSize(undefined), 0);
  assert.ok(LIMITS.total > LIMITS.font);
});

test('asset:name in a layout becomes the data of that image, and an unknown name stays', () => {
  const tpl = '<img src="asset:logo"> <div style="background:url(asset:logo)"></div> <img src="asset:nope">';
  assert.equal(withAssets(tpl, [image]), `<img src="${PNG}"> <div style="background:url(${PNG})"></div> <img src="asset:nope">`);
  assert.equal(withAssets(tpl, []), tpl);
  assert.equal(withAssets(tpl, undefined), tpl);
  assert.equal(withAssets('<img src="asset:my-font">', [font]), '<img src="asset:my-font">');   // a font is not an image
});

test('an asset with a name or data that is not plain is ignored, so it cannot break out of the markup', () => {
  const bad = { ...image, name: 'x" onerror="1', data: 'data:image/png;base64,AAA"onload="1' };
  assert.equal(withAssets('<img src="asset:logo">', [{ ...image, data: 'javascript:alert(1)' }]), '<img src="asset:logo">');
  assert.equal(withAssets('<img src="asset:x">', [bad]), '<img src="asset:x">');
  assert.equal(fontFaceCss([{ ...font, name: 'a"}body{x:y' }, { ...font, data: 'data:font/ttf;base64,AA)' }, { ...font, format: 'evil' }]), '');
});

test('fonts become @font-face rules named after the asset', () => {
  assert.equal(fontFaceCss([image, font]), `@font-face { font-family: "my-font"; src: url(${FONT}) format("truetype"); }`);
  assert.equal(fontFaceCss([]), '');
  assert.equal(fontFaceCss(undefined), '');
});

test('the label and the print CSS carry the assets', () => {
  const s = { width: 70, height: 40, rotate: 0, html: '<img src="asset:logo" style="width:30mm"><div style="font-family:\'my-font\'">{NAME}</div>', assets: [image, font] };
  const html = labelHtml({ NAME: 'Jan', ADDRESS: [], POSTCODE: '', CITY: '', COUNTRY: '', ID: '1' }, s);
  assert.ok(html.includes(`src="${PNG}"`));
  assert.ok(!html.includes('asset:logo'));
  const css = printCss(s);
  assert.ok(css.includes('font-family: "my-font"') && css.includes('@page { size: 70mm 40mm; margin: 0; }'));
  assert.ok(!printCss({ width: 70, height: 40 }).includes('@font-face'));
});

test('the text to insert in the layout', () => {
  assert.equal(snippet(image), '<img src="asset:logo" style="width:30mm;height:10mm">');
  assert.equal(snippet(font), 'font-family: "my-font", sans-serif;');
});
