import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, eventually, fontSize, isHidden, controlCount, waitForControl } from './helpers.mjs';

let t;
before(async () => {
  t = await launch();
  await t.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: t.baseUrl });
});
after(() => t.close());
beforeEach(() => t.clearStorage());

const STYLE = '#webtune-copy-style';
const P1_TEXT = 'First protected paragraph with plain words.';
const SENTINEL = 'sentinel-not-copied';

async function enable(page) {
  await t.setSettings({ copyProtection: true });
  await page.waitForSelector(STYLE, { state: 'attached' });
}

async function disable(page) {
  await t.setSettings({ copyProtection: false });
  await page.waitForSelector(STYLE, { state: 'detached' });
}

const readClipboard = (page) => page.evaluate(() => navigator.clipboard.readText());
const writeClipboard = (page, text) => page.evaluate((x) => navigator.clipboard.writeText(x), text);
const hits = (page) => page.evaluate(() => ({ ...window.__hits }));
const selection = (page) => page.evaluate(() => getSelection().toString());
const userSelect = (page, selector) => page.$eval(selector, (el) => getComputedStyle(el).userSelect);

// Dispatches a cancelable event on an element. true => no page handler cancelled it.
const notCancelled = (page, selector, kind) => page.$eval(selector, (el, kind) => {
  const event = {
    contextmenu: () => new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, button: 2 }),
    copy: () => new ClipboardEvent('copy', { bubbles: true, cancelable: true, composed: true }),
    cut: () => new ClipboardEvent('cut', { bubbles: true, cancelable: true, composed: true }),
    paste: () => new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true }),
    beforecopy: () => new Event('beforecopy', { bubbles: true, cancelable: true, composed: true }),
    selectstart: () => new Event('selectstart', { bubbles: true, cancelable: true, composed: true }),
    keydownC: () => new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }),
  }[kind]();
  return el.dispatchEvent(event);
}, kind);

const BLOCKED_EVENTS = ['contextmenu', 'copy', 'cut', 'paste', 'beforecopy', 'selectstart'];

test('COPY-000 default: OFF, nothing injected, only the boolean is stored', () => t.withPage('copy.html', async (page) => {
  await page.waitForTimeout(300);
  assert.equal(await page.locator(STYLE).count(), 0);
  assert.equal(await userSelect(page, '#p1'), 'none');
  assert.deepEqual(await t.getStorage(), {});
  await t.setSettings({ copyProtection: true });
  await page.waitForSelector(STYLE, { state: 'attached' });
  assert.deepEqual(await t.getStorage(), { copyProtection: true });
}));

test('SELECT-001 text with user-select:none becomes selectable by the mouse when ON', () => t.withPage('copy.html', async (page) => {
  await page.locator('#p1').click({ clickCount: 3 });
  assert.equal(await selection(page), '', 'OFF: page really blocks selection');
  await enable(page);
  await page.locator('#p1').click({ clickCount: 3 });
  assert.equal((await selection(page)).trim(), P1_TEXT);
}));

test('SELECT-002 headings, paragraphs, lists, spans, links and !important class and inline rules are overridden; buttons are not', () => t.withPage('copy.html', async (page) => {
  await enable(page);
  for (const selector of ['body', '#article', '#title', '#p1', '#p2', '#p3', '#li', '#span', '#link']) {
    assert.equal(await userSelect(page, selector), 'text', selector);
  }
  assert.equal(await userSelect(page, '#btn'), 'none', 'buttons keep their UI behaviour');
}));

test('LIMIT-COPY-001 known limitation: an inline style with !important beats any stylesheet', () => t.withPage('copy.html', async (page) => {
  await enable(page);
  assert.equal(await userSelect(page, '#p4'), 'none');
}));

test('CONTEXT-001 a page that blocks right-click no longer does when ON', () => t.withPage('copy.html', async (page) => {
  await page.click('#p1', { button: 'right' });
  assert.ok((await hits(page))['document.oncontextmenu'], 'OFF: page handlers run');
  assert.equal(await notCancelled(page, '#p1', 'contextmenu'), false, 'OFF: right-click is cancelled');
  const before = await hits(page);

  await enable(page);
  await page.click('#p1', { button: 'right' });
  assert.deepEqual(await hits(page), before, 'ON: no blocking handler ran again');
  assert.equal(await notCancelled(page, '#p1', 'contextmenu'), true, 'ON: browser default (native menu) is not cancelled');
}));

test('CONTEXT-002 right-button mousedown/mouseup scripts are neutralised, left clicks still reach the page', () => t.withPage('copy.html', async (page) => {
  await enable(page);
  await page.click('#p1', { button: 'right' });
  await page.click('#p1');
  await page.click('#btn');
  const counts = await hits(page);
  assert.equal(counts['mousedown'], undefined);
  assert.equal(counts['mouseup'], undefined);
  assert.equal(counts['document.onmousedown'], undefined);
  assert.ok(counts['leftmousedown'] >= 2, 'left mousedown handlers unaffected');
  assert.equal(counts['buttonclick'], 1, 'page click handlers unaffected');
}));

test('COPY-001 user-initiated Ctrl+C copies the selection on a page that blocks copy', () => t.withPage('copy.html', async (page) => {
  await writeClipboard(page, SENTINEL);
  await page.evaluate(() => getSelection().selectAllChildren(document.getElementById('p1')));
  await page.keyboard.press('Control+C');
  assert.equal(await readClipboard(page), SENTINEL, 'OFF: page blocks the copy');

  await enable(page);
  await page.keyboard.press('Control+C');
  await eventually(async () => assert.equal((await readClipboard(page)).trim(), P1_TEXT));
}));

test('COPY-002 copy and beforecopy page handlers are neutralised', () => t.withPage('copy.html', async (page) => {
  for (const kind of ['copy', 'beforecopy']) assert.equal(await notCancelled(page, '#p1', kind), false, `OFF ${kind}`);
  await enable(page);
  for (const kind of ['copy', 'beforecopy']) assert.equal(await notCancelled(page, '#p1', kind), true, `ON ${kind}`);
}));

test('COPY-003 cut works in a field whose page blocks it', () => t.withPage('copy.html', async (page) => {
  await page.locator('#cut-input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+X');
  assert.equal(await page.inputValue('#cut-input'), 'cut me', 'OFF: page blocks the cut');

  await enable(page);
  await page.locator('#cut-input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+X');
  assert.equal(await page.inputValue('#cut-input'), '');
  assert.equal(await readClipboard(page), 'cut me');
}));

test('COPY-004 paste works in a field whose page blocks it', () => t.withPage('copy.html', async (page) => {
  await writeClipboard(page, 'pasted text');
  await page.locator('#paste-input').click();
  await page.keyboard.press('Control+V');
  assert.equal(await page.inputValue('#paste-input'), '', 'OFF: page blocks the paste');

  await enable(page);
  await page.locator('#paste-input').click();
  await page.keyboard.press('Control+V');
  assert.equal(await page.inputValue('#paste-input'), 'pasted text');
}));

test('COPY-005 copying out of an input whose page blocks oncopy works', () => t.withPage('copy.html', async (page) => {
  await enable(page);
  await writeClipboard(page, SENTINEL);
  await page.locator('#copy-input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+C');
  await eventually(async () => assert.equal(await readClipboard(page), 'copy me'));
}));

test('KEYBOARD-001 a page that blocks Ctrl+A / Ctrl+C regains normal browser behaviour', () => t.withPage('copy.html', async (page) => {
  await writeClipboard(page, SENTINEL);
  await page.locator('#p1').click();
  await page.keyboard.press('Control+A');
  assert.equal(await selection(page), '', 'OFF: Ctrl+A blocked');

  await enable(page);
  await page.locator('#p1').click();
  await page.keyboard.press('Control+A');
  const all = await selection(page);
  assert.ok(all.includes(P1_TEXT), 'Ctrl+A selects the page text');
  await page.keyboard.press('Control+C');
  await eventually(async () => assert.ok((await readClipboard(page)).includes(P1_TEXT)));
  assert.equal(await notCancelled(page, '#p1', 'keydownC'), true);
}));

test('KEYBOARD-002 only the four clipboard shortcuts are touched: other keys and Ctrl+Shift combos still reach the page', () => t.withPage('copy.html', async (page) => {
  await enable(page);
  await page.keyboard.press('Escape');
  assert.equal((await hits(page)).escape, 1);
  await page.keyboard.press('Control+Shift+V');
  assert.equal((await hits(page)).keydown, 1, 'page still sees Ctrl+Shift+V');
}));

test('DYNAMIC-COPY-001 content added after load is selectable, right-clickable and copyable', () => t.withPage('copy.html', async (page) => {
  await enable(page);
  await page.evaluate(() => window.addLocked('Late arrival one'));
  await page.evaluate(() => window.addLocked('Late arrival two'));
  assert.deepEqual(await page.$$eval('.dyn', (els) => els.map((el) => getComputedStyle(el).userSelect)), ['text', 'text']);
  assert.equal(await notCancelled(page, '.dyn', 'contextmenu'), true);
  assert.equal(await notCancelled(page, '.dyn', 'copy'), true);
  await writeClipboard(page, SENTINEL);
  await page.locator('.dyn').first().click({ clickCount: 3 });
  await page.keyboard.press('Control+C');
  await eventually(async () => assert.equal((await readClipboard(page)).trim(), 'Late arrival one'));
}));

test('DYNAMIC-COPY-002 content added while the feature is OFF is protected, then freed the moment it is turned ON', () => t.withPage('copy.html', async (page) => {
  await page.evaluate(() => window.addLocked('Early'));
  assert.equal(await userSelect(page, '.dyn'), 'none');
  await enable(page);
  assert.equal(await userSelect(page, '.dyn'), 'text');
}));

test('SPA-COPY-001 the feature stays active across pushState navigation without a reload', () => t.withPage('copy-spa.html', async (page) => {
  await page.goto(`${t.baseUrl}/copy-spa.html`);
  await enable(page);
  await page.click('#to-a');
  assert.equal(await userSelect(page, '#text'), 'text');
  assert.equal(await notCancelled(page, '#text', 'contextmenu'), true);
  await page.evaluate(() => { window.__marker = 'same-document'; });
  await page.click('#to-b');
  assert.equal(await page.textContent('#text'), 'Text of view B');
  assert.equal(await page.evaluate(() => window.__marker), 'same-document', 'no full page load happened');
  assert.equal(await userSelect(page, '#text'), 'text');
  assert.equal(await notCancelled(page, '#text', 'contextmenu'), true);
  assert.equal(await notCancelled(page, '#text', 'copy'), true);
  await page.goBack();
  assert.equal(await notCancelled(page, '#text', 'contextmenu'), true);
  assert.equal(await page.locator(STYLE).count(), 1);
}));

test('IFRAME-COPY-001 same-origin and cross-origin frames are handled by their own content script', () => t.withPage('copy-frame.html', async (page) => {
  const frameByName = (name) => page.frames().find((f) => f.parentFrame() && f.url().includes(name === 'cross' ? 'localhost' : '127.0.0.1'));
  await eventually(async () => assert.ok(frameByName('cross')?.url().endsWith('/copy.html')));
  const frames = [frameByName('same'), frameByName('cross')];
  assert.notEqual(new URL(frames[0].url()).origin, new URL(frames[1].url()).origin);
  await enable(page);
  for (const frame of frames) {
    await frame.waitForSelector(STYLE, { state: 'attached' });
    assert.equal(await frame.$eval('#p1', (el) => getComputedStyle(el).userSelect), 'text', frame.url());
    assert.equal(await frame.$eval('#p1', (el) => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))), true, frame.url());
  }
  assert.equal(await page.locator(STYLE).count(), 1, 'one style in the parent');
  await disable(page);
  for (const frame of frames) await frame.waitForSelector(STYLE, { state: 'detached' });
}));

test('SHADOW-COPY-001 open shadow DOM: page handlers are neutralised, but document CSS cannot reach into it (documented limitation)', () => t.withPage('copy.html', async (page) => {
  await enable(page);
  const probe = () => page.evaluate(() => {
    const p = document.getElementById('shadow-host').shadowRoot.getElementById('shadow-p');
    return { cancelled: !p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true })), userSelect: getComputedStyle(p).userSelect };
  });
  assert.deepEqual(await probe(), { cancelled: false, userSelect: 'none' });
}));

test('TOGGLE-COPY-001 OFF → ON → OFF → ON updates the page each time with no accumulation', () => t.withPage('copy.html', async (page) => {
  const state = () => page.evaluate(() => ({
    styles: document.querySelectorAll('#webtune-copy-style').length,
    contextOk: document.getElementById('p1').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    copyOk: document.getElementById('p1').dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true })),
    select: getComputedStyle(document.getElementById('p1')).userSelect,
  }));
  const OFF = { styles: 0, contextOk: false, copyOk: false, select: 'none' };
  const ON = { styles: 1, contextOk: true, copyOk: true, select: 'text' };
  assert.deepEqual(await state(), OFF);
  for (const expected of [ON, OFF, ON, OFF, ON]) {
    await t.setSettings({ copyProtection: expected === ON });
    await eventually(async () => assert.deepEqual(await state(), expected));
  }
  // Rapid toggling settles on the last value.
  for (let i = 0; i < 20; i++) await t.setSettings({ copyProtection: i % 2 === 1 });
  await eventually(async () => assert.deepEqual(await state(), ON));
}));

test('REGRESSION-COPY-002 OFF leaves the site exactly as it is (selection, menu, clipboard events, shortcuts)', () => t.withPage('copy.html', async (page) => {
  // Turn it on and back off, then compare with the untouched original behaviour.
  await enable(page);
  await disable(page);
  assert.equal(await page.locator(STYLE).count(), 0);
  for (const kind of [...BLOCKED_EVENTS, 'keydownC']) assert.equal(await notCancelled(page, '#p1', kind), false, kind);
  assert.equal(await userSelect(page, '#p1'), 'none');
  const before = await hits(page);
  await page.click('#p1', { button: 'right' });
  const after = await hits(page);
  assert.equal(after['document.oncontextmenu'], (before['document.oncontextmenu'] || 0) + 1, 'page handler still runs');
  assert.equal(after['mousedown'], 1);
}));

test('REGRESSION-COPY-001 coexists with media blocking and font override', () => t.withPage('media.html', async (page) => {
  await t.setSettings({ mediaBlocking: true, fontOverride: true, fontSize: 20 });
  await page.waitForSelector('#webtune-media-style', { state: 'attached' });
  await page.waitForSelector('#webtune-font-style', { state: 'attached' });
  await (await waitForControl(page, '#img1', 'show')).click(); // reveal one image
  await waitForControl(page, '#img1', 'hide');
  const controls = await controlCount(page);
  const mediaState = async () => ({ img1: await isHidden(page, '#img1'), img2: await isHidden(page, '#img2'), controls: await controlCount(page), font: await fontSize(page, '#card-text') });
  const original = { img1: false, img2: true, controls, font: 20 };
  assert.deepEqual(await mediaState(), original);

  await enable(page);
  await page.click('body', { button: 'right' });
  assert.deepEqual(await mediaState(), original, 'ON: revealed/hidden media, controls and font size untouched');

  await disable(page);
  assert.deepEqual(await mediaState(), original, 'OFF again: still untouched');
  assert.equal(await page.locator('#webtune-media-style').count(), 1);
  assert.equal(await page.locator('#webtune-font-style').count(), 1);
}));

test('PERSIST-COPY-001 a saved ON state is applied on page load', () => t.withPage('copy.html', async (page) => {
  await enable(page);
  await page.reload();
  await page.waitForSelector(STYLE, { state: 'attached' });
  assert.equal(await userSelect(page, '#p1'), 'text');
  assert.equal(await notCancelled(page, '#p1', 'contextmenu'), true);
}));

test('PERF-COPY-001 one stylesheet, no DOM writes and no observer: a big page stays quiet', () => t.withPage('many-text.html?n=1000', async (page) => {
  await page.evaluate(() => {
    window.__mutations = 0;
    new MutationObserver((records) => { window.__mutations += records.length; }).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
  });
  await enable(page);
  await page.waitForTimeout(500);
  assert.ok((await page.evaluate(() => window.__mutations)) <= 2, 'only the <style> insertion');
  await page.evaluate(() => { window.__mutations = 0; });
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => window.__mutations), 0, 'idle page produces no mutations');
  assert.equal(await page.locator(STYLE).count(), 1);
  assert.equal(await page.evaluate(() => document.body.querySelectorAll('[data-webtune-control],webtune-control').length), 0);
}));

test('POPUP-COPY-001 popup switch updates an open page without reload and persists the boolean', async () => {
  const page = await t.open('copy.html');
  const popup = await t.openPopup();
  assert.equal(await popup.getAttribute('#copy-toggle', 'aria-checked'), 'false');
  assert.equal(await popup.textContent('#copy-toggle'), 'OFF');
  await popup.click('#copy-toggle');
  await page.waitForSelector(STYLE, { state: 'attached' });
  assert.equal(await popup.textContent('#copy-toggle'), 'ON');
  assert.equal((await t.getStorage()).copyProtection, true);
  await popup.click('#copy-toggle');
  await page.waitForSelector(STYLE, { state: 'detached' });
  assert.equal((await t.getStorage()).copyProtection, false);
  await popup.close();
  await page.close();
});

test('ERRORS-COPY-001 no uncaught page errors', () => assert.deepEqual(t.errors, []));
