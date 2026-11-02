import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launch, eventually, fontSize } from './helpers.mjs';

// Playwright cannot see Chrome's native context menu. These tests therefore observe the two
// things the feature controls: the menu item's existence and the title/visibility the service
// worker passes to chrome.contextMenus.update(). What the native menu shows is a manual check.
let t;
before(async () => { t = await launch(); });
after(() => t.close());
beforeEach(() => t.clearStorage());

const MENU_ID = 'webtune-word-count';

const worker = async () =>
  t.context.serviceWorkers().find((w) => w.url().endsWith('/background.js')) ?? t.context.waitForEvent('serviceworker');

// Records every chrome.contextMenus.update() call made from now on.
async function spy() {
  await (await worker()).evaluate(() => {
    globalThis.__menu = [];
    if (globalThis.__spied) return;
    globalThis.__spied = true;
    const original = chrome.contextMenus.update.bind(chrome.contextMenus);
    chrome.contextMenus.update = (id, props) => (globalThis.__menu.push(props), original(id, props));
  });
}
const calls = async () => (await worker()).evaluate(() => globalThis.__menu);
const lastCall = async () => (await calls()).at(-1);
const menuExists = async () => (await worker()).evaluate((id) => chrome.contextMenus.update(id, {}).then(() => true, () => false), MENU_ID);

const selectNode = (page, selector) => page.$eval(selector, (el) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
});
const selectText = (page, text) => page.evaluate((text) => {
  const node = document.createTextNode(text);
  document.body.append(node);
  const range = document.createRange();
  range.selectNodeContents(node);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
}, text);

async function expectTitle(title) {
  await eventually(async () => assert.deepEqual(await lastCall(), { title, visible: true }));
}

test('WORD-000 default: ON, one menu item exists and only the boolean setting is stored', async () => {
  await eventually(async () => assert.equal(await menuExists(), true));
  assert.deepEqual(await t.getStorage(), {});
});

test('WORD-001 basic count', () => t.withPage('words.html', async (page) => {
  await spy();
  await selectNode(page, '#p1');
  await expectTitle('Word Count: 5');
}));

test('WORD-002 punctuation, numbers and the spec examples', () => t.withPage('words.html', async (page) => {
  await spy();
  for (const [selector, count] of [['#p2', 5], ['#p6', 4], ['#p7', 10]]) {
    await selectNode(page, selector);
    await expectTitle(`Word Count: ${count}`);
  }
}));

test('WORD-003 multiple spaces and newlines across inline elements', () => t.withPage('words.html', async (page) => {
  await spy();
  await selectNode(page, '#p3');
  await expectTitle('Word Count: 3');
}));

test('WORD-BN-001 Bangla and WORD-UNICODE-001 mixed text', () => t.withPage('words.html', async (page) => {
  await spy();
  await selectNode(page, '#p4');
  await expectTitle('Word Count: 3');
  await selectNode(page, '#p5');
  await expectTitle('Word Count: 4');
}));

test('WORD-004 changing the selection updates the count (no stale value)', () => t.withPage('words.html', async (page) => {
  await spy();
  await selectNode(page, '#p1');
  await expectTitle('Word Count: 5');
  await selectNode(page, '#p7');
  await expectTitle('Word Count: 10');
  await selectNode(page, '#p1');
  await expectTitle('Word Count: 5');
}));

test('WORD-004b real mouse selection (triple click) is counted', () => t.withPage('words.html', async (page) => {
  await spy();
  await page.locator('#p7').click({ clickCount: 3 });
  await expectTitle('Word Count: 10');
}));

test('WORD-005 empty selection sends nothing; a selection with no words hides the item', () => t.withPage('words.html', async (page) => {
  await spy();
  await page.evaluate(() => getSelection().removeAllRanges());
  await page.waitForTimeout(400);
  assert.deepEqual(await calls(), []);
  await selectNode(page, '#p8');
  await eventually(async () => assert.deepEqual(await lastCall(), { title: 'Word Count: 0', visible: false }));
  await selectNode(page, '#p1');
  await expectTitle('Word Count: 5');
}));

test('WORD-006 large selection: correct count with a thousands separator', () => t.withPage('words.html', async (page) => {
  await spy();
  for (const [n, label] of [[1, '1'], [10, '10'], [100, '100'], [1000, '1,000'], [12450, '12,450']]) {
    await selectText(page, Array.from({ length: n }, (_, i) => `word${i}`).join(' '));
    await expectTitle(`Word Count: ${label}`);
  }
}));

test('WORD-007 dynamically inserted content and text-field selections', () => t.withPage('words.html', async (page) => {
  await spy();
  await selectNode(page, '#late');
  await expectTitle('Word Count: 5');
  await page.$eval('#added', (el) => el.insertAdjacentHTML('beforeend', '<p id="later">added after the extension started working</p>'));
  await selectNode(page, '#later');
  await expectTitle('Word Count: 6');
  await page.$eval('#area', (el) => { el.focus(); el.setSelectionRange(0, 10); });
  await expectTitle('Word Count: 2'); // "alpha beta"
}));

test('WORD-008 turning OFF removes the item and stops processing; ON brings it back', () => t.withPage('words.html', async (page) => {
  await eventually(async () => assert.equal(await menuExists(), true));
  await t.setSettings({ wordCounter: false });
  await eventually(async () => assert.equal(await menuExists(), false));
  await spy();
  await selectNode(page, '#p1');
  await page.waitForTimeout(500);
  assert.deepEqual(await calls(), [], 'no count is calculated or sent while OFF');
  await t.setSettings({ wordCounter: true });
  await eventually(async () => assert.equal(await menuExists(), true));
  await selectNode(page, '#p7');
  await expectTitle('Word Count: 10');
}));

test('WORD-008b rapid toggles settle on the last value without duplicate-id errors', () => t.withPage('words.html', async (page) => {
  for (let i = 0; i < 10; i++) await t.setSettings({ wordCounter: i % 2 === 1 });
  await eventually(async () => assert.equal(await menuExists(), true));
  await t.setSettings({ wordCounter: false });
  await eventually(async () => assert.equal(await menuExists(), false));
}));

test('WORD-010 the native context menu is not blocked or replaced by WebTune', () => t.withPage('words.html', async (page) => {
  await selectNode(page, '#p1');
  const notPrevented = await page.$eval('#p1', (el) => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })));
  assert.equal(notPrevented, true);
  assert.equal(await page.locator('webtune-control, [id^="webtune"]').count(), 0, 'no custom UI is injected');
}));

test('WORD-COPY-001 works with Copy Protection ON on a page that blocks selection', () => t.withPage('copy.html', async (page) => {
  await spy();
  await t.setSettings({ copyProtection: true });
  await page.waitForSelector('#webtune-copy-style', { state: 'attached' });
  await page.locator('#p1').click({ clickCount: 3 });
  await expectTitle('Word Count: 6');
  await page.click('#p1', { button: 'right' });
  await expectTitle('Word Count: 6');
}));

test('WORD-REGRESSION-001 does not change fonts or media, and raises no page errors', () => t.withPage('words.html', async (page) => {
  const before = await fontSize(page, '#p1');
  await selectNode(page, '#p1');
  await page.waitForTimeout(300);
  assert.equal(await fontSize(page, '#p1'), before);
  await t.setSettings({ fontOverride: true, fontSize: 20 });
  await eventually(async () => assert.equal(await fontSize(page, '#p1'), 20));
  await selectNode(page, '#p7');
  await expectTitle('Word Count: 10');
  assert.deepEqual(t.errors, []);
}));

test('WORD-POPUP-001 popup switch defaults ON and writes the boolean', async () => {
  const popup = await t.openPopup();
  const toggle = popup.locator('#word-toggle');
  assert.equal(await toggle.getAttribute('aria-checked'), 'true');
  assert.equal(await toggle.textContent(), 'ON');
  await toggle.click();
  await eventually(async () => assert.deepEqual(await t.getStorage(), { wordCounter: false }));
  await eventually(async () => assert.equal(await menuExists(), false));
  assert.equal(await toggle.textContent(), 'OFF');
  await popup.close();
});

test('WORD-PERSIST-001 OFF survives a browser restart (menu not re-created) and ON is restored', async () => {
  const dir = t.userDataDir;
  await t.setSettings({ wordCounter: false });
  await eventually(async () => assert.equal(await menuExists(), false));
  await t.close({ keepData: true });
  t = await launch({ userDataDir: dir });
  assert.deepEqual(await t.getStorage(), { wordCounter: false });
  await eventually(async () => assert.equal(await menuExists(), false));
  await t.setSettings({ wordCounter: true });
  await eventually(async () => assert.equal(await menuExists(), true));
});
