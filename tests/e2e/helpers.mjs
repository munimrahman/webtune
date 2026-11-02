import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
export const EXTENSION_DIR = join(ROOT, 'webtune');
const PAGES_DIR = join(ROOT, 'tests/pages');

const MIME = { '.html': 'text/html', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.png': 'image/png' };

// Unpacked extensions without a manifest key get an ID derived from their path.
export function extensionIdForPath(path) {
  return [...createHash('sha256').update(path).digest('hex').slice(0, 32)]
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join('');
}

function startServer() {
  const server = createServer((req, res) => {
    const path = join(PAGES_DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(PAGES_DIR) || !existsSync(path) || !statSync(path).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    const body = readFileSync(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'content-length': body.length, 'accept-ranges': 'none' });
    res.end(body);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

export async function launch({ userDataDir = mkdtempSync(join(tmpdir(), 'webtune-e2e-')) } = {}) {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium', // new headless mode, which supports extensions
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });

  const extensionId = extensionIdForPath(EXTENSION_DIR);
  const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

  // An extension page used to read/write chrome.storage.local directly.
  const storagePage = await context.newPage();
  await storagePage.goto(popupUrl);

  const errors = [];
  context.on('weberror', (e) => errors.push(e.error().message));

  const api = {
    context,
    baseUrl,
    popupUrl,
    errors,
    setSettings: (patch) => storagePage.evaluate((p) => chrome.storage.local.set(p), patch),
    getStorage: () => storagePage.evaluate(() => chrome.storage.local.get(null)),
    clearStorage: () => storagePage.evaluate(() => chrome.storage.local.clear()),
    async open(path) {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${path}: ${e.message}`));
      // Broken-URL fixtures intentionally trigger 404 resource errors; anything else is a real error.
      page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${path} console: ${m.text()}`));
      await page.goto(`${baseUrl}/${path}`);
      return page;
    },
    async openPopup() {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`popup: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`popup console: ${m.text()}`));
      await page.goto(popupUrl);
      await page.waitForSelector('body.ready');
      return page;
    },
    userDataDir,
    async withPage(path, fn) {
      const page = await api.open(path);
      try {
        return await fn(page);
      } finally {
        await page.close();
      }
    },
    // Turns blocking on and waits until the content script has injected its stylesheet.
    async blockMedia(page) {
      await api.setSettings({ mediaBlocking: true });
      await page.waitForSelector('#webtune-media-style', { state: 'attached' });
    },
    async close({ keepData = false } = {}) {
      await context.close();
      server.close();
      if (!keepData) rmSync(userDataDir, { recursive: true, force: true });
    },
  };
  return api;
}

// Polls an assertion until it passes (content scripts react to storage changes asynchronously).
export async function eventually(assertion, timeout = 5000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return await assertion();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

// ---- page helpers -------------------------------------------------------

export const isHidden = (page, selector) =>
  page.$eval(selector, (el) => getComputedStyle(el).visibility === 'hidden');

export const rectOf = (page, selector) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  });

// Rect of the Show/Hide button that belongs to a media element.
export const buttonRect = (page, selector) =>
  page.$eval(selector, (el) => {
    const r = el.previousElementSibling.shadowRoot.querySelector('button').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  });

export const fontSize = (page, selector) =>
  page.$eval(selector, (el) => parseFloat(getComputedStyle(el).fontSize));

// The control that sits right before a media element.
export const controlFor = (page, selector) =>
  page.locator(`${selector} >> xpath=preceding-sibling::*[1][self::webtune-control]`);

export const controlCount = (page) => page.locator('webtune-control').count();

export const showButton = (page, selector) => controlFor(page, selector).locator('button');

export async function waitForControl(page, selector, state) {
  const host = controlFor(page, selector);
  await host.and(page.locator(`[data-webtune-control="${state}"]`)).waitFor({ state: 'attached' });
  return host.locator('button');
}
