import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, eventually, isHidden, fontSize, controlCount } from './helpers.mjs';

let t;
before(async () => { t = await launch(); });
after(() => t.close());
beforeEach(() => t.clearStorage());

const state = (popup) => popup.evaluate(() => ({
  media: document.getElementById('media-toggle').getAttribute('aria-checked'),
  mediaText: document.getElementById('media-toggle').textContent,
  hidePressed: document.getElementById('hide-media').getAttribute('aria-pressed'),
  showPressed: document.getElementById('show-media').getAttribute('aria-pressed'),
  font: document.getElementById('font-toggle').getAttribute('aria-checked'),
  size: document.getElementById('font-size').value,
  sizeText: document.getElementById('font-size-value').textContent,
}));

test('POPUP-001 popup opens with fresh-install defaults', async () => {
  const popup = await t.openPopup();
  assert.deepEqual(await state(popup), { media: 'false', mediaText: 'OFF', hidePressed: 'false', showPressed: 'true', font: 'false', size: '16', sizeText: '16px' });
  assert.equal(await popup.locator('h1').textContent(), 'WebTune');
  assert.equal(await popup.locator('header p').textContent(), 'Customize Your Web');
  assert.deepEqual(await popup.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight })), { w: 280, h: await popup.evaluate(() => document.body.scrollHeight) });
  assert.ok((await popup.evaluate(() => document.body.scrollHeight)) < 500, 'popup stays small');
  await popup.close();
});

test('POPUP-002 popup reflects previously saved settings', async () => {
  await t.setSettings({ mediaBlocking: true, fontOverride: true, fontSize: 22 });
  const popup = await t.openPopup();
  await eventually(async () => assert.deepEqual(await state(popup), { media: 'true', mediaText: 'ON', hidePressed: 'true', showPressed: 'false', font: 'true', size: '22', sizeText: '22px' }));
  await popup.close();
});

test('POPUP-003 toggles, Hide/Show Media buttons and slider write the right values to storage', async () => {
  const popup = await t.openPopup();
  await popup.click('#media-toggle');
  await eventually(async () => assert.equal((await t.getStorage()).mediaBlocking, true));
  await popup.click('#show-media');
  await eventually(async () => assert.equal((await t.getStorage()).mediaBlocking, false));
  await popup.click('#hide-media');
  await eventually(async () => assert.equal((await t.getStorage()).mediaBlocking, true));
  await popup.click('#hide-media'); // idempotent
  assert.equal((await t.getStorage()).mediaBlocking, true);

  await popup.click('#font-toggle');
  await eventually(async () => assert.equal((await t.getStorage()).fontOverride, true));
  await popup.locator('#font-size').fill('20');
  await eventually(async () => assert.equal((await t.getStorage()).fontSize, 20));
  assert.equal(await popup.textContent('#font-size-value'), '20px');
  await popup.click('#font-toggle');
  await eventually(async () => assert.deepEqual(await t.getStorage(), { mediaBlocking: true, fontOverride: false, fontSize: 20 }));
  await popup.close();
});

test('POPUP-004 slider offers exactly 12–24px in steps of 2', async () => {
  const popup = await t.openPopup();
  assert.deepEqual(await popup.$eval('#font-size', (el) => [el.min, el.max, el.step]), ['12', '24', '2']);
  await popup.close();
});

test('POPUP-005 popup stays in sync when settings change elsewhere', async () => {
  const popup = await t.openPopup();
  await t.setSettings({ mediaBlocking: true, fontSize: 24 });
  await eventually(async () => assert.deepEqual(
    await popup.evaluate(() => [document.getElementById('media-toggle').textContent, document.getElementById('font-size').value]),
    ['ON', '24'],
  ));
  await popup.close();
});

test('POPUP-006 popup changes update an already-open page without a reload', async () => {
  const page = await t.open('media.html');
  const popup = await t.openPopup();
  await popup.click('#hide-media');
  await eventually(async () => assert.equal(await isHidden(page, '#img1'), true));
  await popup.click('#font-toggle');
  await popup.locator('#font-size').fill('24');
  await eventually(async () => assert.equal(await fontSize(page, '#after-img'), 24));
  await popup.click('#show-media');
  await eventually(async () => assert.equal(await isHidden(page, '#img1'), false));
  await eventually(async () => assert.equal(await controlCount(page), 0));
  await popup.click('#font-toggle');
  await eventually(async () => assert.equal(await fontSize(page, '#after-img'), 16));
  await popup.close();
  await page.close();
});

test('POPUP-007 changes apply to every open tab', async () => {
  const [a, b] = [await t.open('media.html'), await t.open('many.html?n=5')];
  await t.setSettings({ mediaBlocking: true });
  await eventually(async () => assert.equal(await isHidden(a, '#img1'), true));
  await eventually(async () => assert.equal(await isHidden(b, '#i0'), true));
  await Promise.all([a.close(), b.close()]);
});

test('PERSIST-001 settings survive page reload and a popup re-open', async () => {
  const popup = await t.openPopup();
  await popup.click('#media-toggle');
  await popup.click('#font-toggle');
  await popup.locator('#font-size').fill('18');
  await eventually(async () => assert.equal((await t.getStorage()).fontSize, 18));
  await popup.close();

  const page = await t.open('media.html');
  await page.waitForSelector('#webtune-media-style', { state: 'attached' });
  await page.waitForSelector('#webtune-font-style', { state: 'attached' });
  assert.equal(await fontSize(page, '#after-img'), 18);
  await page.reload();
  await page.waitForSelector('#webtune-media-style', { state: 'attached' });
  assert.equal(await isHidden(page, '#img1'), true);
  assert.equal(await fontSize(page, '#after-img'), 18);
  await page.close();

  const reopened = await t.openPopup();
  await eventually(async () => assert.deepEqual(await state(reopened), { media: 'true', mediaText: 'ON', hidePressed: 'true', showPressed: 'false', font: 'true', size: '18', sizeText: '18px' }));
  await reopened.close();
});

test('PERSIST-002 stored data holds only the three settings (nothing about pages)', async () => {
  const page = await t.open('media.html');
  await t.setSettings({ mediaBlocking: true });
  await page.waitForSelector('#webtune-media-style', { state: 'attached' });
  await page.locator('webtune-control button').first().click();
  assert.deepEqual(Object.keys(await t.getStorage()).sort(), ['mediaBlocking']);
  await t.setSettings({ fontOverride: true, fontSize: 20 });
  assert.deepEqual(Object.keys(await t.getStorage()).sort(), ['fontOverride', 'fontSize', 'mediaBlocking']);
  await page.close();
});

test('PERSIST-003 settings survive a full browser restart', async () => {
  const first = await launch();
  await first.setSettings({ mediaBlocking: true, fontOverride: true, fontSize: 20 });
  const { userDataDir } = first;
  await first.close({ keepData: true });

  const second = await launch({ userDataDir });
  try {
    assert.deepEqual(await second.getStorage(), { mediaBlocking: true, fontOverride: true, fontSize: 20 });
    const page = await second.open('media.html');
    await page.waitForSelector('#webtune-media-style', { state: 'attached' });
    assert.equal(await isHidden(page, '#img1'), true);
    assert.equal(await fontSize(page, '#after-img'), 20);
  } finally {
    await second.close();
  }
});

test('POPUP-008 no console or page errors in the popup or content scripts', () => assert.deepEqual(t.errors, []));
