import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome ??= { tabs: {}, runtime: {}, storage: { local: {} } };
const { paper, printCss, printSummary, isRoll, feedOf } = await import('../extension/lib/labels.js');
const { setLang } = await import('../extension/lib/messages.js');
const { DEFAULTS } = await import('../extension/lib/store.js');

setLang('en');
const roll = { width: 50, height: 30, rotate: 0, media: 'roll', feed: 3 };

test('die-cut labels are unchanged: the page is the label, whatever feed is set', () => {
  assert.deepEqual(paper({ width: 70, height: 40, rotate: 0 }), { w: 70, h: 40, r: 0 });
  assert.deepEqual(paper({ width: 70, height: 40, rotate: 0, media: 'label', feed: 5 }), { w: 70, h: 40, r: 0 });
  assert.equal(DEFAULTS.media, 'label');
  assert.equal(DEFAULTS.feed, 0);
});

test('on a continuous roll the page is the cut length plus the feed, along the way the paper leaves the printer', () => {
  assert.ok(isRoll(roll));
  assert.deepEqual(paper(roll), { w: 50, h: 33, r: 0 });
  assert.deepEqual(paper({ ...roll, rotate: 90 }), { w: 30, h: 53, r: 90 });
  assert.deepEqual(paper({ ...roll, rotate: 270 }), { w: 30, h: 53, r: 270 });
  assert.deepEqual(paper({ ...roll, rotate: 180 }), { w: 50, h: 33, r: 180 });
  assert.match(printCss(roll), /@page \{ size: 50mm 33mm; margin: 0; \}/);
});

test('the feed is limited to 0-50 mm and ignores nonsense', () => {
  assert.equal(feedOf({ ...roll, feed: -4 }), 0);
  assert.equal(feedOf({ ...roll, feed: 'x' }), 0);
  assert.equal(feedOf({ ...roll, feed: 99 }), 50);
  assert.equal(feedOf({ ...roll, feed: '2.5' }), 2.5);
});

test('a sheet is never a roll', () => {
  const s = { ...roll, sheet: { on: true, paperW: 210, paperH: 297, cols: 3, rows: 8 } };
  assert.ok(!isRoll(s));
  assert.deepEqual(paper(s), { w: 210, h: 297, r: 0 });
});

test('the print summary names a continuous roll', () => {
  assert.equal(printSummary([{}, {}], roll), '2 labels of 50×30 mm on a continuous roll');
  assert.equal(printSummary([{}], { width: 70, height: 40 }), '1 label of 70×40 mm');
});
