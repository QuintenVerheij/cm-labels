import test from 'node:test';
import assert from 'node:assert/strict';
import { barcodeSvg } from '../extension/lib/barcode.js';

const measure = html => ({
  width: +html.match(/<svg[^>]*\swidth="([\d.]+)mm"/)[1],
  quiet: +html.match(/padding:0 ([\d.]+)mm/)[1],
});

test('code128 at the default module is 22.5 mm wide with a 2.5 mm quiet zone each side', () => {
  const { width, quiet } = measure(barcodeSvg({ type: 'code128', value: '1234567890' }));
  assert.equal(width, 22.5);
  assert.equal(quiet, 2.5);
});

test('qrcode at the default module keeps 0.25 mm per module', () => {
  const { width, quiet } = measure(barcodeSvg({ type: 'qrcode', value: 'A' }));
  assert.equal(width, 5.25);
  assert.equal(quiet, 1);
});

test('datamatrix at the default module keeps 0.25 mm per module', () => {
  const { width, quiet } = measure(barcodeSvg({ type: 'datamatrix', value: 'A' }));
  assert.equal(width, 2.5);
  assert.equal(quiet, 1);
});

test('pdf417 at the default module keeps 0.25 mm per module (one bwip-js unit per module)', () => {
  const { width, quiet } = measure(barcodeSvg({ type: 'pdf417', value: 'HELLO' }));
  assert.equal(width, 25.75);
  assert.equal(quiet, 1);
});
