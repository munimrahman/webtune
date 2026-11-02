// Copy Protection Override: restores text selection, copy/cut/paste and the native context menu
// on pages that block them. Selection is restored with one stylesheet. Page handlers are
// neutralised by capture-phase listeners on window that stop the event before any page listener
// or on* handler sees it; the browser's default action is never touched, so nothing is faked.
// Events are handled where they happen, so dynamic content and SPA navigation need no observer.
(() => {
  const { SCOPE, create } = WebTune.style;
  const style = create('webtune-copy-style');

  // Not the blanket `*`: buttons keep their normal, unselectable UI behaviour.
  const CSS = `${SCOPE} *:not(button, [role="button"]) { user-select: text !important; }`;

  // Events no page needs in order to function, only to block the user.
  const ALWAYS = ['contextmenu', 'selectstart', 'copy', 'cut', 'paste', 'beforecopy'];
  const SHORTCUT_KEYS = new Set(['a', 'c', 'x', 'v']);

  function stop(event) {
    event.stopImmediatePropagation();
  }

  // Left-button mouse events are left alone (they drive the whole page); only the right button
  // is targeted, because that is what "no right click" scripts react to.
  function stopRightButton(event) {
    if (event.button === 2) event.stopImmediatePropagation();
  }

  function stopClipboardShortcut(event) {
    const { key, ctrlKey, metaKey, altKey, shiftKey } = event;
    if ((ctrlKey || metaKey) && !altKey && !shiftKey && SHORTCUT_KEYS.has(key.toLowerCase())) {
      event.stopImmediatePropagation();
    }
  }

  const LISTENERS = [
    ...ALWAYS.map((type) => [type, stop]),
    ['mousedown', stopRightButton],
    ['mouseup', stopRightButton],
    ['keydown', stopClipboardShortcut],
  ];

  let active = false;

  function setEnabled(enabled) {
    if (enabled === active) return;
    active = enabled;
    for (const [type, listener] of LISTENERS) {
      if (enabled) window.addEventListener(type, listener, true);
      else window.removeEventListener(type, listener, true);
    }
    if (enabled) style.set(CSS);
    else style.clear();
  }

  globalThis.WebTune = { ...globalThis.WebTune, copyProtection: { setEnabled } };
})();
