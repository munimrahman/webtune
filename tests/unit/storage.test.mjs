import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory stand-in for chrome.storage.local.
let data;
let listeners;
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
      set: async (patch) => {
        const changes = {};
        for (const [key, value] of Object.entries(patch)) {
          changes[key] = { oldValue: data[key], newValue: value };
          data[key] = value;
        }
        listeners.forEach((l) => l(changes, 'local'));
      },
    },
    onChanged: { addListener: (l) => listeners.push(l) },
  },
};

await import('../../webtune/src/utils/storage.js');
const { storage } = globalThis.WebTune;

beforeEach(() => {
  data = {};
  listeners = [];
});

test('SETTINGS-001 fresh install defaults', async () => {
  assert.deepEqual(await storage.get(), { mediaBlocking: false, fontOverride: false, fontSize: 16, copyProtection: false, wordCounter: true });
});

test('SETTINGS-002 stored values override defaults, missing keys keep defaults', async () => {
  data = { mediaBlocking: true, fontSize: 20 };
  assert.deepEqual(await storage.get(), { mediaBlocking: true, fontOverride: false, fontSize: 20, copyProtection: false, wordCounter: true });
});

test('SETTINGS-003 corrupt stored values fall back to defaults', async () => {
  data = { mediaBlocking: 'yes', fontOverride: 1, fontSize: 'huge', copyProtection: 'on' };
  assert.deepEqual(await storage.get(), { mediaBlocking: false, fontOverride: false, fontSize: 16, copyProtection: false, wordCounter: true });
});

test('SETTINGS-004 out-of-range font sizes are rejected', () => {
  assert.equal(storage.sanitize({ fontSize: 11 }).fontSize, 16);
  assert.equal(storage.sanitize({ fontSize: 25 }).fontSize, 16);
  assert.equal(storage.sanitize({ fontSize: 12 }).fontSize, 12);
  assert.equal(storage.sanitize({ fontSize: 24 }).fontSize, 24);
  assert.equal(storage.sanitize({ fontSize: '18' }).fontSize, 18);
});

test('SETTINGS-005 set() only persists known settings keys', async () => {
  await storage.set({ mediaBlocking: true, visitedUrl: 'https://example.com', revealed: ['img1'] });
  assert.deepEqual(Object.keys(data), ['mediaBlocking']);
});

test('SETTINGS-006 onChange reports only changed settings from the local area', async () => {
  const seen = [];
  storage.onChange((changes) => seen.push(changes));
  await storage.set({ fontSize: 22 });
  await storage.set({ unrelated: 1 }); // ignored: not a WebTune key
  listeners.forEach((l) => l({ fontSize: { newValue: 99 } }, 'sync')); // ignored: wrong area
  assert.deepEqual(seen, [{ fontSize: 22 }]);
});

test('SETTINGS-007 copyProtection is a strict boolean that defaults to false', async () => {
  assert.equal(storage.DEFAULTS.copyProtection, false);
  assert.equal(storage.sanitize({ copyProtection: true }).copyProtection, true);
  for (const bad of [1, 'true', null, undefined, {}]) assert.equal(storage.sanitize({ copyProtection: bad }).copyProtection, false);
  data = { copyProtection: true };
  assert.equal((await storage.get()).copyProtection, true);
});

test('WORD-PERSIST-000 wordCounter is a strict boolean that defaults to true', async () => {
  assert.equal(storage.DEFAULTS.wordCounter, true);
  assert.equal(storage.sanitize({ wordCounter: false }).wordCounter, false);
  assert.equal(storage.sanitize({ wordCounter: true }).wordCounter, true);
  for (const bad of [0, 'false', null, undefined, {}]) assert.equal(storage.sanitize({ wordCounter: bad }).wordCounter, true);
  data = { wordCounter: false };
  assert.equal((await storage.get()).wordCounter, false);
});
