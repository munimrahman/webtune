// Service worker entry point: wires settings and page messages to the browser-side features.
// It holds no state of its own; everything is re-derived from chrome.storage.local on wake-up.
import '../utils/storage.js';
import * as wordCountMenu from './features/wordCountMenu.js';

const { storage } = WebTune;

// Runs one sync at a time so quick toggles cannot interleave removeAll() and create().
let menuQueue = Promise.resolve();

function syncMenu() {
  menuQueue = menuQueue.then(async () => wordCountMenu.setEnabled((await storage.get()).wordCounter)).catch(() => {});
}

// Menus are registered once per install, update and browser start, never per service worker wake-up.
chrome.runtime.onInstalled.addListener(syncMenu);
chrome.runtime.onStartup.addListener(syncMenu);

storage.onChange((changes) => {
  if ('wordCounter' in changes) syncMenu();
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === 'webtune-word-count') wordCountMenu.setCount(message.count);
});
