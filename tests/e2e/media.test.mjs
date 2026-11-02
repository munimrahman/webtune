import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, eventually, isHidden, rectOf, buttonRect, controlCount, waitForControl, controlFor } from './helpers.mjs';

let t;
before(async () => { t = await launch(); });
after(() => t.close());
beforeEach(() => t.clearStorage());

const IMAGES = ['#img1', '#img2', '#img3', '#img4', '#img5'];
const VIDEOS = ['#vid-controls', '#vid-plain', '#vid-poster', '#vid-auto', '#vid-missing'];
const ALL_IMG = ['#img1', '#img2', '#img3', '#img4', '#img5', '#grid1', '#grid2', '#grid3', '#card-img', '#linked-img', '#btn-img', '#pic-img'];
const bgImage = (page, selector, pseudo = null) =>
  page.$eval(selector, (el, p) => getComputedStyle(el, p).backgroundImage, pseudo);

async function settled(page, expectedControls) {
  await eventually(async () => assert.equal(await controlCount(page), expectedControls));
}

test('DEFAULT-001 fresh install: media is untouched and no WebTune UI exists', () => t.withPage('media.html', async (page) => {
  assert.deepEqual(await t.getStorage(), {});
  for (const sel of [...ALL_IMG, ...VIDEOS]) assert.equal(await isHidden(page, sel), false, sel);
  for (const sel of ['#bg', '#bg-shorthand', '#bg-important']) assert.match(await bgImage(page, sel), /url\(/, sel);
  assert.equal(await controlCount(page), 0);
  assert.equal(await page.locator('#webtune-media-style, #webtune-font-style').count(), 0);
}));

test('MEDIA-001 blocking ON hides every <img> and gives each a small Show button', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await settled(page, ALL_IMG.length + VIDEOS.length);
  for (const sel of ALL_IMG) {
    assert.equal(await isHidden(page, sel), true, `${sel} hidden`);
    await waitForControl(page, sel, 'show');
  }
}));

test('MEDIA-002 Show buttons are small, subtle and sit on the hidden image', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await settled(page, ALL_IMG.length + VIDEOS.length);
  for (const sel of [...IMAGES, '#grid2', '#card-img']) {
    await eventually(async () => {
      const img = await rectOf(page, sel);
      const btn = await buttonRect(page, sel);
      assert.ok(btn.width < 60 && btn.height < 24, `${sel} button ${btn.width}x${btn.height} is small`);
      assert.ok(btn.x >= img.x && btn.y >= img.y && btn.right <= img.right && btn.bottom <= img.bottom, `${sel} button inside image`);
    });
  }
}));

test('MEDIA-003 hiding keeps layout: nothing shifts when blocking is turned on', () => t.withPage('media.html', async (page) => {
  const probes = ['#grid', '#card', '#link', '#bg', '#after-img', '#page-button'];
  const before = await Promise.all(probes.map((s) => rectOf(page, s)));
  await t.blockMedia(page);
  await settled(page, ALL_IMG.length + VIDEOS.length);
  assert.deepEqual(await Promise.all(probes.map((s) => rectOf(page, s))), before);
}));

test('MEDIA-004 Show reveals only that image, then Hide restores it', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await (await waitForControl(page, '#img2', 'show')).click();

  await waitForControl(page, '#img2', 'hide');
  assert.equal(await isHidden(page, '#img2'), false);
  for (const sel of ['#img1', '#img3', '#img4', '#img5', '#grid1', '#card-img']) {
    assert.equal(await isHidden(page, sel), true, `${sel} stays hidden`);
    await waitForControl(page, sel, 'show');
  }

  // Hide button sits in the image's bottom-right corner.
  await eventually(async () => {
    const img = await rectOf(page, '#img2');
    const btn = await buttonRect(page, '#img2');
    assert.ok(btn.right <= img.right && btn.bottom <= img.bottom && btn.x > img.x + img.width / 2 && btn.y > img.y + img.height / 2);
  });

  await (await waitForControl(page, '#img2', 'hide')).click();
  await waitForControl(page, '#img2', 'show');
  assert.equal(await isHidden(page, '#img2'), true);
  assert.equal(await page.locator('#img2[data-webtune-revealed]').count(), 0);
}));

test('MEDIA-005 five images are independently controllable (alternating)', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  for (const sel of ['#img1', '#img3', '#img5']) await (await waitForControl(page, sel, 'show')).click();
  const expected = { '#img1': false, '#img2': true, '#img3': false, '#img4': true, '#img5': false };
  for (const [sel, hidden] of Object.entries(expected)) assert.equal(await isHidden(page, sel), hidden, sel);
  await (await waitForControl(page, '#img3', 'hide')).click();
  Object.assign(expected, { '#img3': true });
  for (const [sel, hidden] of Object.entries(expected)) assert.equal(await isHidden(page, sel), hidden, sel);
}));

test('MEDIA-006 100 images stay independent through repeated show/hide', () => t.withPage('many.html?n=100', async (page) => {
  await t.blockMedia(page);
  await settled(page, 100);
  for (let i = 0; i < 100; i += 2) await page.locator(`#i${i}`).evaluate((el) => el.previousElementSibling.shadowRoot.querySelector('button').click());
  const states = await page.$$eval('#wrap img', (imgs) => imgs.map((img) => getComputedStyle(img).visibility === 'hidden'));
  assert.deepEqual(states, states.map((_, i) => i % 2 === 1));
  for (let i = 0; i < 100; i += 4) await page.locator(`#i${i}`).evaluate((el) => el.previousElementSibling.shadowRoot.querySelector('button').click());
  const after = await page.$$eval('#wrap img', (imgs) => imgs.map((img) => getComputedStyle(img).visibility === 'hidden'));
  // Multiples of 4 were hidden again; i % 4 === 2 stay revealed; odd ones were never revealed.
  assert.deepEqual(after, after.map((_, i) => i % 4 !== 2));
  assert.equal(await controlCount(page), 100, 'no duplicate or stale controls');
}));

test('MEDIA-007 Show/Hide clicks do not trigger links or page click handlers', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await page.evaluate(() => { window.__docClicks = 0; document.addEventListener('click', () => window.__docClicks++); });
  await (await waitForControl(page, '#linked-img', 'show')).click();
  await (await waitForControl(page, '#linked-img', 'hide')).click();
  await (await waitForControl(page, '#btn-img', 'show')).click();
  assert.equal(await page.evaluate(() => location.hash), '', 'link was not followed');
  assert.equal(await page.evaluate(() => window.__docClicks), 0, 'click did not bubble to the page');
}));

test('MEDIA-008 normal page interactions keep working while blocking is ON', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await settled(page, ALL_IMG.length + VIDEOS.length);
  await page.click('#page-button');
  await page.click('#page-button');
  assert.equal(await page.evaluate(() => window.__pageClicks), 2);
}));

test('BG-001 background-image is hidden while ON (longhand, shorthand, !important, pseudo-element)', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  for (const sel of ['#bg', '#bg-shorthand', '#bg-important']) assert.equal(await bgImage(page, sel), 'none', sel);
  assert.equal(await bgImage(page, '#pseudo', '::before'), 'none');
}));

test('BG-002 background elements get no Show/Hide control and cannot be revealed', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await settled(page, ALL_IMG.length + VIDEOS.length);
  // Every control is attached directly in front of an <img> or <video>, never anything else.
  const targets = await page.$$eval('webtune-control', (hosts) => hosts.map((h) => h.nextElementSibling.localName));
  assert.ok(targets.every((name) => name === 'img' || name === 'video'), targets.join());
  for (const sel of ['#bg', '#bg-shorthand', '#bg-important', '#pseudo']) assert.equal(await controlFor(page, sel).count(), 0, sel);
  assert.equal(await page.locator('[data-webtune-revealed]').count(), 0);
}));

test('BG-003 background-image returns when blocking is turned OFF', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await t.setSettings({ mediaBlocking: false });
  await eventually(async () => assert.match(await bgImage(page, '#bg'), /bg\.svg/));
  assert.match(await bgImage(page, '#bg-shorthand'), /bg\.svg/);
  assert.match(await bgImage(page, '#bg-important'), /bg\.svg/);
  assert.match(await bgImage(page, '#pseudo', '::before'), /bg\.svg/);
}));

test('GLOBAL-001 OFF → ON → OFF → ON: full restore, controls vanish, reveal state is not remembered', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await settled(page, ALL_IMG.length + VIDEOS.length);
  await (await waitForControl(page, '#img1', 'show')).click();
  await (await waitForControl(page, '#vid-controls', 'show')).click();
  assert.equal(await isHidden(page, '#img1'), false);

  await t.setSettings({ mediaBlocking: false });
  await eventually(async () => assert.equal(await controlCount(page), 0));
  for (const sel of [...ALL_IMG, ...VIDEOS]) assert.equal(await isHidden(page, sel), false, `${sel} visible when OFF`);
  assert.equal(await page.locator('#webtune-media-style').count(), 0);
  assert.equal(await page.locator('[data-webtune-revealed]').count(), 0, 'no leftover attributes');

  await t.blockMedia(page);
  await settled(page, ALL_IMG.length + VIDEOS.length);
  assert.equal(await isHidden(page, '#img1'), true, 'previously revealed image is blocked again');
  assert.equal(await isHidden(page, '#vid-controls'), true);
  await waitForControl(page, '#img1', 'show');
}));

test('GLOBAL-002 individual reveal state is never written to storage', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await (await waitForControl(page, '#img1', 'show')).click();
  await (await waitForControl(page, '#vid-plain', 'show')).click();
  assert.deepEqual(await t.getStorage(), { mediaBlocking: true });
}));

test('GLOBAL-003 reload with blocking ON blocks again; revealed media does not persist', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await (await waitForControl(page, '#img3', 'show')).click();
  await page.reload();
  await page.waitForSelector('#webtune-media-style', { state: 'attached' });
  await settled(page, ALL_IMG.length + VIDEOS.length);
  assert.equal(await isHidden(page, '#img3'), true);
}));

// ---- Video -----------------------------------------------------------------

const snapshot = (page, selector) => page.$eval(selector, (v) => ({
  attrs: Object.fromEntries([...v.attributes].filter((a) => a.name !== 'data-webtune-revealed').map((a) => [a.name, a.value])),
  controls: v.controls, autoplay: v.autoplay, muted: v.muted, loop: v.loop, preload: v.preload, poster: v.poster, src: v.currentSrc,
}));

test('VIDEO-001 videos are hidden with Show buttons; Show reveals only that video', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  for (const sel of VIDEOS) {
    assert.equal(await isHidden(page, sel), true, sel);
    await waitForControl(page, sel, 'show');
  }
  await (await waitForControl(page, '#vid-plain', 'show')).click();
  await waitForControl(page, '#vid-plain', 'hide');
  assert.equal(await isHidden(page, '#vid-plain'), false);
  for (const sel of VIDEOS.filter((s) => s !== '#vid-plain')) assert.equal(await isHidden(page, sel), true, sel);
  await (await waitForControl(page, '#vid-plain', 'hide')).click();
  await waitForControl(page, '#vid-plain', 'show');
  assert.equal(await isHidden(page, '#vid-plain'), true);
}));

test('VIDEO-002 revealed video keeps its original attributes, controls, muted/autoplay and source', () => t.withPage('media.html', async (page) => {
  await page.waitForTimeout(500);
  const original = {};
  for (const sel of VIDEOS) original[sel] = await snapshot(page, sel);
  assert.equal(original['#vid-controls'].controls, true);
  assert.equal(original['#vid-plain'].controls, false);
  assert.equal(original['#vid-auto'].autoplay, true);

  await t.blockMedia(page);
  for (const sel of VIDEOS) await (await waitForControl(page, sel, 'show')).click();
  for (const sel of VIDEOS) assert.deepEqual(await snapshot(page, sel), original[sel], `${sel} after Show`);

  for (const sel of VIDEOS) await (await waitForControl(page, sel, 'hide')).click();
  for (const sel of VIDEOS) assert.deepEqual(await snapshot(page, sel), original[sel], `${sel} after Hide`);
}));

test('VIDEO-003 Show does not start playback; native controls still work', () => t.withPage('media.html', async (page) => {
  await page.waitForTimeout(500);
  await t.blockMedia(page);
  await (await waitForControl(page, '#vid-controls', 'show')).click();
  await (await waitForControl(page, '#vid-plain', 'show')).click();
  await page.waitForTimeout(600);
  for (const sel of ['#vid-controls', '#vid-plain']) {
    const state = await page.$eval(sel, (v) => ({ paused: v.paused, time: v.currentTime }));
    assert.deepEqual(state, { paused: true, time: 0 }, `${sel} not playing after Show`);
  }
  // The native control bar is reachable: clicking the video toggles playback.
  await page.click('#vid-controls', { position: { x: 160, y: 80 } });
  await eventually(async () => assert.equal(await page.$eval('#vid-controls', (v) => v.paused), false));
}));

test('VIDEO-004 Hide button on a video avoids the native control bar (top-right)', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await (await waitForControl(page, '#vid-controls', 'show')).click();
  await eventually(async () => {
    const video = await rectOf(page, '#vid-controls');
    const btn = await buttonRect(page, '#vid-controls');
    assert.ok(btn.right <= video.right && btn.y >= video.y && btn.bottom < video.y + 40 && btn.x > video.x + video.width / 2);
  });
}));

test('VIDEO-005 video poster is hidden together with the video', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  assert.equal(await isHidden(page, '#vid-poster'), true);
}));

// ---- Edge cases ------------------------------------------------------------

test('EDGE-001 broken, src-less and native-lazy images are blocked and controllable', () => t.withPage('edge.html', async (page) => {
  await t.blockMedia(page);
  for (const sel of ['#broken', '#no-src', '#lazy-native']) {
    assert.equal(await isHidden(page, sel), true, sel);
    await (await waitForControl(page, sel, 'show')).click();
    assert.equal(await isHidden(page, sel), false, `${sel} revealed`);
  }
}));

test('EDGE-002 1x1 tracking pixels get no visible button', () => t.withPage('edge.html', async (page) => {
  await t.blockMedia(page);
  assert.equal(await isHidden(page, '#tiny'), true);
  await eventually(async () => assert.equal(await controlFor(page, '#tiny').getAttribute('data-idle'), ''));
  assert.equal(await controlFor(page, '#tiny').locator('button').isVisible(), false);
}));

test('EDGE-003 media inside a scroll container: button follows the image and is clipped with it', () => t.withPage('edge.html', async (page) => {
  await t.blockMedia(page);
  await page.$eval('#scroller', (el) => { el.scrollTop = 30; }); // img-1 is now 70px visible
  await eventually(async () => {
    const box = await rectOf(page, '#scroller');
    const img = await rectOf(page, '#scroll-img-1');
    const btn = await buttonRect(page, '#scroll-img-1');
    assert.ok(btn.y >= box.y && btn.x >= img.x && btn.right <= img.right, 'Show sits on the visible part of the image');
  });
  await (await waitForControl(page, '#scroll-img-1', 'show')).click();
  await page.$eval('#scroller', (el) => { el.scrollTop = 20; });
  await eventually(async () => {
    const box = await rectOf(page, '#scroller');
    const btn = await buttonRect(page, '#scroll-img-1');
    assert.ok(btn.bottom <= box.bottom && btn.bottom <= (await rectOf(page, '#scroll-img-1')).bottom);
  });
  // Scrolled fully out of the container: no stray button floats over the page.
  await page.$eval('#scroller', (el) => { el.scrollTop = 150; });
  await eventually(async () => assert.equal(await controlFor(page, '#scroll-img-1').getAttribute('data-idle'), ''));
  assert.equal(await controlFor(page, '#scroll-img-1').locator('button').isVisible(), false);
}));

test('EDGE-004 media far below the fold gets a correctly placed button after scrolling', () => t.withPage('edge.html', async (page) => {
  await t.blockMedia(page);
  await page.$eval('#far-img', (el) => el.scrollIntoView());
  await eventually(async () => {
    const img = await rectOf(page, '#far-img');
    const btn = await buttonRect(page, '#far-img');
    assert.ok(btn.x >= img.x && btn.y >= img.y && btn.right <= img.right && btn.bottom <= img.bottom);
  });
  await (await waitForControl(page, '#far-img', 'show')).click();
  assert.equal(await isHidden(page, '#far-img'), false);
}));

test('EDGE-005 media that starts display:none gets a button once it is displayed', () => t.withPage('edge.html', async (page) => {
  await t.blockMedia(page);
  await eventually(async () => assert.equal(await controlFor(page, '#hidden-img').getAttribute('data-idle'), ''));
  await page.$eval('#hidden-holder', (el) => { el.style.display = 'block'; });
  await eventually(async () => assert.equal(await controlFor(page, '#hidden-img').getAttribute('data-idle'), null));
  assert.equal(await controlFor(page, '#hidden-img').locator('button').isVisible(), true);
}));

test('EDGE-006 fixed-position page elements are not affected', () => t.withPage('edge.html', async (page) => {
  const before = await rectOf(page, '#fixed-bar');
  await t.blockMedia(page);
  assert.deepEqual(await rectOf(page, '#fixed-bar'), before);
}));

// ---- Rapid toggling --------------------------------------------------------

test('RACE-001 rapid global ON/OFF/ON/OFF/ON ends ON with exactly one control per media', () => t.withPage('media.html', async (page) => {
  for (const value of [true, false, true, false, true]) await t.setSettings({ mediaBlocking: value });
  await settled(page, ALL_IMG.length + VIDEOS.length);
  assert.equal(await page.locator('#webtune-media-style').count(), 1);
  const dupes = await page.$$eval('img, video', (els) => els.filter((el) => {
    let n = 0;
    for (let s = el.previousElementSibling; s?.localName === 'webtune-control'; s = s.previousElementSibling) n++;
    return n !== 1;
  }).length);
  assert.equal(dupes, 0);
  for (const value of [false, true, false]) await t.setSettings({ mediaBlocking: value });
  await eventually(async () => assert.equal(await controlCount(page), 0));
  assert.equal(await page.locator('#webtune-media-style').count(), 0);
}));

test('RACE-002 rapid Show/Hide on one element leaves a single consistent control', () => t.withPage('media.html', async (page) => {
  await t.blockMedia(page);
  await waitForControl(page, '#img1', 'show');
  await page.$eval('#img1', (img) => {
    const button = img.previousElementSibling.shadowRoot.querySelector('button');
    for (let i = 0; i < 9; i++) button.click();
  });
  await waitForControl(page, '#img1', 'hide');
  assert.equal(await isHidden(page, '#img1'), false);
  assert.equal(await controlFor(page, '#img1').count(), 1);
  assert.equal(await controlCount(page), ALL_IMG.length + VIDEOS.length);
  await page.$eval('#img1', (img) => img.previousElementSibling.shadowRoot.querySelector('button').click());
  await waitForControl(page, '#img1', 'show');
  assert.equal(await isHidden(page, '#img1'), true);
}));

test('ERRORS-001 no uncaught page errors were produced during media tests', () => {
  assert.deepEqual(t.errors, []);
});
