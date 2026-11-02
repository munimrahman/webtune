import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, eventually, isHidden, fontSize, controlCount, controlFor, waitForControl } from './helpers.mjs';

let t;
before(async () => { t = await launch(); });
after(() => t.close());
beforeEach(() => t.clearStorage());

const call = (page, fn, ...args) => page.evaluate(([name, a]) => window[name](...a), [fn, args]);

test('DYNAMIC-001 images inserted after load are hidden and get one Show button when ON', () => t.withPage('dynamic.html', async (page) => {
  await t.blockMedia(page);
  const id = await call(page, 'addImage');
  await eventually(async () => assert.equal(await isHidden(page, `#${id}`), true));
  await waitForControl(page, `#${id}`, 'show');
  await (await waitForControl(page, `#${id}`, 'show')).click();
  assert.equal(await isHidden(page, `#${id}`), false);
  assert.equal(await controlCount(page), 1);
}));

test('DYNAMIC-002 videos inserted after load are hidden and controllable', () => t.withPage('dynamic.html', async (page) => {
  await t.blockMedia(page);
  const id = await call(page, 'addVideo');
  assert.equal(await isHidden(page, `#${id}`), true);
  await (await waitForControl(page, `#${id}`, 'show')).click();
  assert.equal(await isHidden(page, `#${id}`), false);
  assert.equal(await page.$eval(`#${id}`, (v) => v.controls && v.paused), true);
}));

test('DYNAMIC-003 media inside a freshly created container tree is picked up', () => t.withPage('dynamic.html', async (page) => {
  await t.blockMedia(page);
  const id = await call(page, 'addComponent');
  await eventually(async () => assert.equal(await controlCount(page), 2));
  assert.equal(await isHidden(page, `#${id} img`), true);
  assert.equal(await isHidden(page, `#${id} video`), true);
}));

test('DYNAMIC-004 media inserted while OFF is untouched, and picked up when blocking turns ON', () => t.withPage('dynamic.html', async (page) => {
  const img = await call(page, 'addImage');
  const video = await call(page, 'addVideo');
  assert.equal(await isHidden(page, `#${img}`), false);
  assert.equal(await controlCount(page), 0);
  await t.blockMedia(page);
  await eventually(async () => assert.equal(await controlCount(page), 2));
  assert.equal(await isHidden(page, `#${video}`), true);
}));

test('DYNAMIC-005 dynamically added background-image is hidden with no control', () => t.withPage('dynamic.html', async (page) => {
  await t.blockMedia(page);
  await call(page, 'addBackground');
  assert.equal(await page.$eval('#bg-dyn', (el) => getComputedStyle(el).backgroundImage), 'none');
  assert.equal(await controlFor(page, '#bg-dyn').count(), 0);
  await t.setSettings({ mediaBlocking: false });
  await eventually(async () => assert.match(await page.$eval('#bg-dyn', (el) => getComputedStyle(el).backgroundImage), /bg\.svg/));
}));

test('DYNAMIC-006 lazy-loaded image (src assigned later) stays blocked and controllable', () => t.withPage('dynamic.html', async (page) => {
  await t.blockMedia(page);
  await call(page, 'addLazy');
  await page.waitForFunction(() => document.getElementById('lazy-img').complete && document.getElementById('lazy-img').naturalWidth > 0);
  assert.equal(await isHidden(page, '#lazy-img'), true);
  await (await waitForControl(page, '#lazy-img', 'show')).click();
  assert.equal(await isHidden(page, '#lazy-img'), false);
}));

test('DYNAMIC-007 SPA view replacement: old controls are cleaned up, new media is blocked', () => t.withPage('dynamic.html', async (page) => {
  await t.blockMedia(page);
  await call(page, 'renderView', 'one');
  await (await waitForControl(page, '#view-img', 'show')).click();
  await call(page, 'renderView', 'two'); // replaces everything via innerHTML
  await eventually(async () => assert.equal(await controlCount(page), 1));
  assert.equal(await isHidden(page, '#view-img'), true, 'new view image is blocked even though the old one was revealed');
  await waitForControl(page, '#view-img', 'show');
  assert.equal(await page.locator('body > webtune-control, #root webtune-control').count(), 1);
}));

test('DYNAMIC-008 removing media removes its control (no stale controls)', () => t.withPage('dynamic.html', async (page) => {
  await t.blockMedia(page);
  const a = await call(page, 'addImage');
  const b = await call(page, 'addImage');
  await eventually(async () => assert.equal(await controlCount(page), 2));
  await call(page, 'removeNode', a); // the image alone is removed, its sibling control is not
  await eventually(async () => assert.equal(await controlCount(page), 1));
  await call(page, 'replaceInitial');
  await eventually(async () => assert.equal(await controlCount(page), 0));
  assert.equal(await page.locator(`#${b}`).count(), 0);
}));

test('DYNAMIC-009 moving revealed media keeps it revealed and its control follows', () => t.withPage('dynamic.html', async (page) => {
  await t.blockMedia(page);
  const id = await call(page, 'addImage');
  await (await waitForControl(page, `#${id}`, 'show')).click();
  await call(page, 'moveNode', id, 'other');
  await eventually(async () => assert.equal(await page.locator(`#other > #${id}`).count(), 1));
  await waitForControl(page, `#${id}`, 'hide');
  assert.equal(await isHidden(page, `#${id}`), false);
  assert.equal(await controlCount(page), 1);
}));

test('DYNAMIC-010 burst of 200 inserted images: one control each, no duplicates', () => t.withPage('dynamic.html', async (page) => {
  await t.blockMedia(page);
  await page.evaluate(() => { for (let i = 0; i < 200; i++) window.addImage(document.getElementById('other')); });
  await eventually(async () => assert.equal(await controlCount(page), 200));
  await page.waitForTimeout(300);
  assert.equal(await controlCount(page), 200);
}));

test('DYNAMIC-011 font override applies to dynamically added text', () => t.withPage('font.html', async (page) => {
  await t.setSettings({ fontOverride: true, fontSize: 22 });
  await page.waitForSelector('#webtune-font-style', { state: 'attached' });
  await page.evaluate(() => window.addText());
  for (const sel of ['#dyn-p', '#dyn-h', '#dyn-button', '#dyn-nav', '#dyn-card', '#dyn-input']) {
    assert.equal(await fontSize(page, sel), 22, sel);
  }
}));

test('DYNAMIC-012 font override survives SPA view replacement', () => t.withPage('dynamic.html', async (page) => {
  await t.setSettings({ fontOverride: true, fontSize: 18 });
  await page.waitForSelector('#webtune-font-style', { state: 'attached' });
  await call(page, 'renderView', 'x');
  for (const sel of ['#view-title', '#view-text', '#view-button', '#view-nav a', '#view-card', '#view-input']) {
    assert.equal(await fontSize(page, sel), 18, sel);
  }
}));

test('DYNAMIC-013 no uncaught page errors', () => assert.deepEqual(t.errors, []));
