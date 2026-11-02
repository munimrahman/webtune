// Entry point: applies saved settings and keeps the page in sync with storage changes.
(async () => {
  const { storage, media, font, copyProtection, wordCounter } = WebTune;
  let settings = null;

  function apply(next) {
    media.setEnabled(next.mediaBlocking);
    font.apply({ enabled: next.fontOverride, size: next.fontSize });
    copyProtection.setEnabled(next.copyProtection);
    wordCounter.setEnabled(next.wordCounter);
  }

  // Subscribe before the first read so a change made during startup is not lost.
  storage.onChange((changes) => {
    if (!settings) return;
    settings = storage.sanitize({ ...settings, ...changes });
    apply(settings);
  });

  settings = await storage.get();
  apply(settings);
})();
