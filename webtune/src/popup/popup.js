(async () => {
  const { storage } = WebTune;
  const $ = (id) => document.getElementById(id);
  const mediaToggle = $('media-toggle');
  const hideMedia = $('hide-media');
  const showMedia = $('show-media');
  const fontToggle = $('font-toggle');
  const fontSize = $('font-size');
  const fontSizeValue = $('font-size-value');
  const copyToggle = $('copy-toggle');
  const wordToggle = $('word-toggle');

  let settings = { ...storage.DEFAULTS };

  fontSize.min = storage.FONT_SIZE.min;
  fontSize.max = storage.FONT_SIZE.max;
  fontSize.step = storage.FONT_SIZE.step;

  function setSwitch(button, on) {
    button.setAttribute('aria-checked', String(on));
    button.textContent = on ? 'ON' : 'OFF';
  }

  function render() {
    setSwitch(mediaToggle, settings.mediaBlocking);
    hideMedia.setAttribute('aria-pressed', String(settings.mediaBlocking));
    showMedia.setAttribute('aria-pressed', String(!settings.mediaBlocking));
    setSwitch(fontToggle, settings.fontOverride);
    fontSize.value = settings.fontSize;
    fontSizeValue.textContent = `${settings.fontSize}px`;
    // The size stays editable while the override is OFF; it is dimmed to show it is inactive.
    document.body.classList.toggle('font-off', !settings.fontOverride);
    setSwitch(copyToggle, settings.copyProtection);
    setSwitch(wordToggle, settings.wordCounter);
  }

  function update(patch) {
    settings = storage.sanitize({ ...settings, ...patch });
    render();
    return storage.set(patch);
  }

  mediaToggle.addEventListener('click', () => update({ mediaBlocking: !settings.mediaBlocking }));
  hideMedia.addEventListener('click', () => update({ mediaBlocking: true }));
  showMedia.addEventListener('click', () => update({ mediaBlocking: false }));
  fontToggle.addEventListener('click', () => update({ fontOverride: !settings.fontOverride }));
  copyToggle.addEventListener('click', () => update({ copyProtection: !settings.copyProtection }));
  wordToggle.addEventListener('click', () => update({ wordCounter: !settings.wordCounter }));
  fontSize.addEventListener('input', () => update({ fontSize: Number(fontSize.value) }));

  storage.onChange((changes) => {
    settings = storage.sanitize({ ...settings, ...changes });
    render();
  });

  render();
  settings = await storage.get();
  render();
  document.body.classList.add('ready');
})();
