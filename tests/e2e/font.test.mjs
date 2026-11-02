import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, eventually, fontSize } from './helpers.mjs';

let t;
before(async () => { t = await launch(); });
after(() => t.close());
beforeEach(() => t.clearStorage());

const TEXT_SELECTORS = [
  '#h1', '#h2', '#nav-link', '#p-px', '#p-rem', '#p-var', '#p-important', '#p-inline', '#p-vw',
  '#span-small', '#strong', '#li', '#card', '#card-title', '#card-text', '#label', '#name', '#select',
  '#textarea', '#button', '#td',
];
const SIZES = [12, 14, 16, 18, 20, 22, 24];

const measureAll = async (page) => Object.fromEntries(await Promise.all(TEXT_SELECTORS.map(async (s) => [s, await fontSize(page, s)])));

async function enableFont(page, size) {
  await t.setSettings({ fontOverride: true, fontSize: size });
  await page.waitForSelector('#webtune-font-style', { state: 'attached' });
}

test('FONT-001 default: override OFF leaves original sizes untouched', () => t.withPage('font.html', async (page) => {
  const sizes = await measureAll(page);
  assert.equal(sizes['#h1'], 50); // 2.5rem of 20px
  assert.equal(sizes['#p-px'], 13);
  assert.equal(sizes['#p-important'], 40);
  assert.equal(await page.locator('#webtune-font-style').count(), 0);
}));

test('FONT-002 a saved size with override OFF changes nothing', () => t.withPage('font.html', async (page) => {
  const original = await measureAll(page);
  await t.setSettings({ fontSize: 24, fontOverride: false });
  await page.waitForTimeout(300);
  assert.deepEqual(await measureAll(page), original);
}));

for (const size of SIZES) {
  test(`FONT-003 ${size}px is applied to headings, paragraphs, nav, lists, cards, forms, buttons, tables (all CSS techniques)`, () => t.withPage('font.html', async (page) => {
    await enableFont(page, size);
    const sizes = await measureAll(page);
    for (const [selector, value] of Object.entries(sizes)) assert.equal(value, size, selector);
  }));
}

test('FONT-004 inline-style and !important site rules are overridden', () => t.withPage('font.html', async (page) => {
  await enableFont(page, 18);
  assert.equal(await fontSize(page, '#p-inline'), 18);
  assert.equal(await fontSize(page, '#p-important'), 18);
}));

test('FONT-005 pseudo-elements follow the override', () => t.withPage('font.html', async (page) => {
  await page.$eval('body', (b) => { b.insertAdjacentHTML('beforeend', '<style>#pe::before{content:"x";font-size:40px}</style><p id="pe">p</p>'); });
  await enableFont(page, 14);
  assert.equal(await page.$eval('#pe', (el) => getComputedStyle(el, '::before').fontSize), '14px');
}));

test('FONT-006 layout guard: <html> font size and rem-based spacing are left alone', () => t.withPage('font.html', async (page) => {
  const padding = () => page.$eval('#rem-box', (el) => getComputedStyle(el).paddingTop);
  const htmlSize = () => fontSize(page, 'html');
  const original = [await padding(), await htmlSize()];
  await enableFont(page, 24);
  assert.deepEqual([await padding(), await htmlSize()], original);
}));

test('FONT-007 reversibility: 18 → 24 → 14 → OFF returns exactly to the original', () => t.withPage('font.html', async (page) => {
  const original = await measureAll(page);
  const attrsBefore = await page.$$eval('body *', (els) => els.map((el) => el.getAttribute('style')));
  const attrNamesBefore = await page.$$eval('body *', (els) => els.map((el) => el.getAttributeNames().join()));

  await enableFont(page, 18);
  await eventually(async () => assert.equal(await fontSize(page, '#h1'), 18));
  await t.setSettings({ fontSize: 24 });
  await eventually(async () => assert.equal(await fontSize(page, '#h1'), 24));
  await t.setSettings({ fontSize: 14 });
  await eventually(async () => assert.equal(await fontSize(page, '#h1'), 14));
  await t.setSettings({ fontOverride: false });
  await eventually(async () => assert.deepEqual(await measureAll(page), original));

  assert.equal(await page.locator('#webtune-font-style').count(), 0, 'stylesheet removed');
  assert.deepEqual(await page.$$eval('body *', (els) => els.map((el) => el.getAttribute('style'))), attrsBefore, 'no inline style changes');
  assert.deepEqual(await page.$$eval('body *', (els) => els.map((el) => el.getAttributeNames().join())), attrNamesBefore, 'no attributes added');
}));

test('FONT-008 font override never writes to the page DOM besides one <style>', () => t.withPage('font.html', async (page) => {
  const before = await page.evaluate(() => document.body.innerHTML);
  await enableFont(page, 20);
  assert.equal(await page.evaluate(() => document.body.innerHTML), before);
  assert.equal(await page.locator('style#webtune-font-style').count(), 1);
}));

test('FONT-009 changing size repeatedly keeps a single stylesheet', () => t.withPage('font.html', async (page) => {
  await enableFont(page, 12);
  for (const size of [14, 16, 18, 20, 22, 24, 12]) await t.setSettings({ fontSize: size });
  await eventually(async () => assert.equal(await fontSize(page, '#p-px'), 12));
  assert.equal(await page.locator('#webtune-font-style').count(), 1);
}));

test('FONT-010 media and font features work together and independently', () => t.withPage('media.html', async (page) => {
  await t.setSettings({ fontOverride: true, fontSize: 20, mediaBlocking: true });
  await page.waitForSelector('#webtune-font-style', { state: 'attached' });
  await page.waitForSelector('#webtune-media-style', { state: 'attached' });
  assert.equal(await fontSize(page, '#card-text'), 20);
  // The Show/Hide buttons are not resized by the page-wide font override.
  await eventually(async () => assert.equal(await page.locator('webtune-control').first().locator('button').evaluate((b) => getComputedStyle(b).fontSize), '10px'));
  await t.setSettings({ mediaBlocking: false });
  await eventually(async () => assert.equal(await page.locator('#webtune-media-style').count(), 0));
  assert.equal(await page.locator('#webtune-font-style').count(), 1);
  assert.equal(await fontSize(page, '#card-text'), 20);
}));

test('FONT-011 no uncaught page errors', () => assert.deepEqual(t.errors, []));
