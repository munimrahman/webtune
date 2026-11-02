import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const EXTENSION_DIR = join(import.meta.dirname, '../../webtune');
const manifest = JSON.parse(readFileSync(join(EXTENSION_DIR, 'manifest.json'), 'utf8'));

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return ['.js', '.html', '.css', '.json'].includes(extname(path)) ? [path] : [];
  });
}

test('SECURITY-001 manifest is MV3 and requests only the storage and contextMenus permissions', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'contextMenus']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.optional_permissions, undefined);
});

test('SECURITY-002 content scripts match only http(s), never <all_urls>', () => {
  const matches = manifest.content_scripts.flatMap((s) => s.matches);
  assert.deepEqual(matches, ['http://*/*', 'https://*/*']);
});

test('SECURITY-003 the only background code is the module service worker; no externally_connectable', () => {
  assert.deepEqual(manifest.background, { service_worker: 'src/background/background.js', type: 'module' });
  assert.equal(manifest.externally_connectable, undefined);
});

test('SECURITY-004 no network APIs, dynamic code or remote resources in source', () => {
  const forbidden = [
    /\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /\beval\s*\(/, /new\s+Function\s*\(/,
    /\bimportScripts\b/, /<script[^>]+src=["']https?:/i, /https?:\/\/(?!www\.w3\.org)/,
    /localStorage/, /document\.cookie/, /chrome\.storage\.sync/, /chrome\.history/, /chrome\.tabs/,
  ];
  for (const file of sourceFiles(EXTENSION_DIR)) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      // manifest.json legitimately contains http(s) *match patterns*, which are not requests.
      if (file.endsWith('manifest.json') && pattern.source.startsWith('https?')) continue;
      assert.ok(!pattern.test(text), `${file} matches ${pattern}`);
    }
  }
});

test('SECURITY-005 only the five global settings are ever written to storage', () => {
  const text = readFileSync(join(EXTENSION_DIR, 'src/utils/storage.js'), 'utf8');
  assert.match(text, /mediaBlocking: false,\s*fontOverride: false,\s*fontSize: 16,\s*copyProtection: false,\s*wordCounter: true/);
  for (const file of sourceFiles(join(EXTENSION_DIR, 'src')).filter((f) => !f.endsWith('storage.js'))) {
    assert.ok(!/chrome\.storage\.local\.set/.test(readFileSync(file, 'utf8')), `${file} writes storage directly`);
  }
});
