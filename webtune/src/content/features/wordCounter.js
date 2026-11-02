// Word Counter (content side): counts the words in the current text selection and reports the
// number to the service worker, which shows it in the native right-click menu. The count is
// sent shortly after the selection settles (not at right-click time) so the menu title is
// already up to date when the browser opens the menu. Nothing but the number leaves the page;
// the selected text is neither stored nor logged.
(() => {
  const SETTLE_MS = 150;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

  // Unicode word boundaries: Bangla, CJK and mixed text work, "10,000" and "3.14" are one word
  // each, a hyphenated "Hello-world" is two, and punctuation, emoji and whitespace never count.
  function count(text) {
    let words = 0;
    for (const part of segmenter.segment(text)) {
      if (part.isWordLike) words++;
    }
    return words;
  }

  let timer = null;
  let active = false;

  function report() {
    timer = null;
    const text = getSelection().toString();
    if (!text) return; // nothing selected: the menu item is not shown for an empty selection
    try {
      chrome.runtime.sendMessage({ type: 'webtune-word-count', count: count(text) }).catch(() => {});
    } catch {
      // The extension was reloaded or updated; this orphaned content script can no longer reach it.
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(report, SETTLE_MS);
  }

  // Selecting in another tab or frame moves the shared menu title, so refresh on regaining focus.
  const listeners = () => [
    [document, 'selectionchange'],
    [window, 'focus'],
  ];

  function setEnabled(enabled) {
    if (enabled === active) return;
    active = enabled;
    for (const [target, type] of listeners()) {
      if (enabled) target.addEventListener(type, schedule);
      else target.removeEventListener(type, schedule);
    }
    if (!enabled) {
      clearTimeout(timer);
      timer = null;
    }
  }

  globalThis.WebTune = { ...globalThis.WebTune, wordCounter: { setEnabled, count } };
})();
