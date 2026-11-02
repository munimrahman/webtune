import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../../webtune/src/content/features/wordCounter.js');
const { count } = globalThis.WebTune.wordCounter;

test('WORD-001 basic count', () => {
  assert.equal(count('Hello world this is WebTune'), 5);
  assert.equal(count('Hello world. This is WebTune.'), 5);
  assert.equal(count('Hello'), 1);
});

test('WORD-002 punctuation never creates words', () => {
  assert.equal(count('Hello, world! How are you?'), 5);
  assert.equal(count('Hello...'), 1);
  assert.equal(count('"Hello"'), 1);
  assert.equal(count('...'), 0);
  assert.equal(count('?! — , ;'), 0);
});

test('WORD-003 whitespace (spaces, tabs, newlines, paragraphs) never creates words', () => {
  assert.equal(count('Hello    \t  world'), 2);
  assert.equal(count('Hello\n\nworld'), 2);
  assert.equal(count('  \n\t  Hello \r\n world  \n'), 2);
  assert.equal(count(''), 0);
  assert.equal(count(' \n\t '), 0);
});

test('WORD-BN-001 Bangla', () => {
  assert.equal(count('আমি বাংলায় লিখছি।'), 3);
  assert.equal(count('আমি\n\nবাংলায়   লিখছি'), 3);
});

test('WORD-UNICODE-001 mixed and other scripts', () => {
  assert.equal(count('আমি WebTune ব্যবহার করছি।'), 4);
  assert.equal(count('Привет мир'), 2);
  assert.equal(count('naïve café'), 2);
  assert.equal(count('你好世界'), 2); // CJK is segmented by the ICU dictionary
});

test('WORD-NUMBER-001 numbers count as words; separators inside a number do not split it', () => {
  assert.equal(count('I have 500 books.'), 4);
  for (const n of ['2026', '500', '10,000', '3.14', '১২৩']) assert.equal(count(n), 1, n);
});

test('WORD-EDGE-001 documented behaviour for ambiguous cases', () => {
  assert.equal(count("don't"), 1);
  assert.equal(count('don’t'), 1);
  assert.equal(count('Hello-world'), 2); // hyphenated: two words
  assert.equal(count('Hello—world'), 2);
  assert.equal(count('example.com'), 1);
  assert.equal(count('https://example.com/a'), 3);
  assert.equal(count('a@b.com'), 2);
  assert.equal(count('😀 😀'), 0); // emoji are not words
  assert.equal(count('Hi 😀 there'), 2);
});

test('WORD-LARGE-001 10,000+ words are counted quickly', () => {
  for (const n of [1, 10, 100, 1000, 10000, 100000]) {
    const text = Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
    const start = performance.now();
    assert.equal(count(text), n);
    if (n === 100000) assert.ok(performance.now() - start < 1000, 'stays responsive');
  }
});
