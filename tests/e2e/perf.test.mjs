import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, eventually, controlCount } from './helpers.mjs';

let t;
before(async () => { t = await launch(); });
after(() => t.close());
beforeEach(() => t.clearStorage());

// Measures main-thread long tasks (>50ms) and DOM mutations on the page.
const instrument = (page) => page.evaluate(() => {
  window.__long = 0;
  window.__mutations = 0;
  new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long += e.duration; }).observe({ entryTypes: ['longtask'] });
  new MutationObserver((records) => { window.__mutations += records.length; }).observe(document, { childList: true, subtree: true, attributes: true });
});

for (const count of [10, 50, 100, 500]) {
  test(`PERF-001 ${count} images: blocked quickly with exactly one control each and no mutation feedback loop`, () => t.withPage(`many.html?n=${count}`, async (page) => {
    await instrument(page);
    const start = Date.now();
    await t.blockMedia(page);
    await eventually(async () => assert.equal(await controlCount(page), count), 10000);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 3000, `took ${elapsed}ms`);

    // Once settled our own writes must not trigger further processing.
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__mutations = 0; });
    await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(() => window.__mutations), 0, 'DOM is quiet when idle');
    assert.equal(await controlCount(page), count, 'no duplicates');
    const long = await page.evaluate(() => window.__long);
    assert.ok(long < 800, `long-task time ${long}ms`);
  }));
}

test('PERF-002 continuous dynamic insertion (infinite-scroll style) does not accumulate duplicates or slow down', () => t.withPage('dynamic.html', async (page) => {
  await t.blockMedia(page);
  await instrument(page);
  await page.evaluate(async () => {
    const holder = document.getElementById('other');
    for (let batch = 0; batch < 20; batch++) {
      for (let i = 0; i < 10; i++) window.addImage(holder);
      await new Promise((r) => setTimeout(r, 20));
    }
  });
  await eventually(async () => assert.equal(await controlCount(page), 200));
  await page.waitForTimeout(500);
  assert.equal(await controlCount(page), 200);
  assert.ok((await page.evaluate(() => window.__long)) < 800);
}));

test('PERF-003 font override on a large page costs one stylesheet and no DOM writes', () => t.withPage('many.html?n=500', async (page) => {
  await instrument(page);
  await t.setSettings({ fontOverride: true, fontSize: 20 });
  await page.waitForSelector('#webtune-font-style', { state: 'attached' });
  await page.waitForTimeout(500);
  assert.ok((await page.evaluate(() => window.__mutations)) <= 2, 'only the <style> insertion');
}));

test('PERF-004 toggling blocking 20 times on 100 images leaves the page clean', () => t.withPage('many.html?n=100', async (page) => {
  for (let i = 0; i < 20; i++) await t.setSettings({ mediaBlocking: i % 2 === 0 });
  await t.setSettings({ mediaBlocking: false });
  await eventually(async () => assert.equal(await controlCount(page), 0));
  assert.equal(await page.locator('#webtune-media-style, [data-webtune-revealed]').count(), 0);
  assert.equal(await page.$$eval('#wrap > *', (els) => els.filter((e) => e.localName !== 'img').length), 0);
}));

test('PERF-005 no errors', () => assert.deepEqual(t.errors, []));
