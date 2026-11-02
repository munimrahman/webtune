// Word Counter (browser side): one persistent "Word Count: N" item in the native context menu,
// shown only while text is selected. The title is rewritten whenever a page reports a new count.
// The count lives only in the menu title, so a suspended service worker loses nothing.
const MENU_ID = 'webtune-word-count';

function format(count) {
  return `Word Count: ${count.toLocaleString('en-US')}`;
}

export async function setEnabled(enabled) {
  await chrome.contextMenus.removeAll();
  if (!enabled) return;
  chrome.contextMenus.create({
    id: MENU_ID,
    title: format(0),
    contexts: ['selection'],
    visible: false,
  });
}

// Informational only: the item has no click handler. A selection with no words (whitespace,
// punctuation) hides the item rather than showing "Word Count: 0".
export function setCount(count) {
  if (!Number.isSafeInteger(count) || count < 0) return;
  // Rejects when the item does not exist (feature turned OFF); there is nothing to update then.
  chrome.contextMenus.update(MENU_ID, { title: format(count), visible: count > 0 }).catch(() => {});
}
