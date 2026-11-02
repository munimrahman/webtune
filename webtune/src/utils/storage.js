// Global settings stored in chrome.storage.local. Shared by the popup and content scripts.
(() => {
  const DEFAULTS = Object.freeze({
    mediaBlocking: false,
    fontOverride: false,
    fontSize: 16,
    copyProtection: false,
    wordCounter: true,
  });
  const FONT_SIZE = Object.freeze({ min: 12, max: 24, step: 2 });
  const KEYS = Object.keys(DEFAULTS);

  function sanitize(settings) {
    const size = Number(settings.fontSize);
    return {
      mediaBlocking: settings.mediaBlocking === true,
      fontOverride: settings.fontOverride === true,
      fontSize: size >= FONT_SIZE.min && size <= FONT_SIZE.max ? size : DEFAULTS.fontSize,
      copyProtection: settings.copyProtection === true,
      wordCounter: typeof settings.wordCounter === 'boolean' ? settings.wordCounter : DEFAULTS.wordCounter,
    };
  }

  async function get() {
    return sanitize({ ...DEFAULTS, ...(await chrome.storage.local.get(KEYS)) });
  }

  function set(patch) {
    const known = Object.fromEntries(Object.entries(patch).filter(([key]) => KEYS.includes(key)));
    return chrome.storage.local.set(known);
  }

  // Calls back with only the settings that changed, e.g. { fontSize: 20 }.
  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const updated = {};
      for (const key of KEYS) {
        if (key in changes) updated[key] = changes[key].newValue;
      }
      if (Object.keys(updated).length > 0) callback(updated);
    });
  }

  globalThis.WebTune = { ...globalThis.WebTune, storage: { DEFAULTS, FONT_SIZE, sanitize, get, set, onChange } };
})();
