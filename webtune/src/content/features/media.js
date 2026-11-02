// Global media blocking.
//
// Hiding is pure CSS (visibility:hidden keeps layout and the network request intact):
//   - <img>/<video> are hidden unless they carry the REVEALED attribute.
//   - background-image is removed from every element. It has no per-element control.
// JavaScript only manages the small Show/Hide buttons for <img> and <video>.
// Reveal state lives in that attribute on the element and is never persisted.
(() => {
  const REVEALED_ATTR = 'data-webtune-revealed';
  const CONTROL_ATTR = 'data-webtune-control';
  const MEDIA_SELECTOR = 'img, video';
  // Media rendered smaller than this (tracking pixels, collapsed placeholders) gets no button.
  const MIN_CONTROL_SIZE = 8;
  const STOPPED_EVENTS = ['pointerdown', 'mousedown', 'mouseup', 'touchstart', 'keydown'];

  const { SCOPE, create } = WebTune.style;
  const style = create('webtune-media-style');

  const PAGE_CSS = `
${SCOPE} img:not([${REVEALED_ATTR}]),
${SCOPE} video:not([${REVEALED_ATTR}]) { visibility: hidden !important; }
${SCOPE}, ${SCOPE} *, ${SCOPE} *::before, ${SCOPE} *::after { background-image: none !important; }`;

  // The host is a zero-size absolutely positioned box, so it never takes part in the
  // page's flow, flex or grid layout. It is moved onto the media with a transform.
  const HOST_STYLE = [
    'position: absolute',
    'inset: auto',
    'display: block',
    'width: 0',
    'height: 0',
    'margin: 0',
    'padding: 0',
    'border: 0',
    'float: none',
    'overflow: visible',
    'opacity: 1',
    'visibility: visible',
    'pointer-events: auto',
    'z-index: 100',
  ].map((declaration) => `${declaration} !important`).join('; ');

  const CONTROL_CSS = `
:host([data-idle]) button { display: none; }
button {
  all: initial; position: absolute; box-sizing: border-box; padding: 3px 7px;
  font: 600 10px/1 system-ui, sans-serif; color: #333; background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.3); border-radius: 3px; cursor: pointer; opacity: 0.65;
}
button:hover, button:focus-visible { opacity: 1; }
button[data-anchor="top-left"] { left: 2px; top: 2px; }
button[data-anchor="top-right"] { right: 2px; top: 2px; }
button[data-anchor="bottom-right"] { right: 2px; bottom: 2px; }`;

  const items = new Map(); // media element -> { el, host, button, x, y, released }
  const pending = new Set();
  let frame = 0;
  let enabled = false;
  let mutationObserver = null;
  let intersectionObserver = null;

  function* mediaIn(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches(MEDIA_SELECTOR)) yield node;
    yield* node.querySelectorAll(MEDIA_SELECTOR);
  }

  // Show sits at the top-left. Hide sits bottom-right on images and top-right on
  // videos, so it never covers the native video controls bar.
  function anchorFor(el, revealed) {
    if (!revealed) return 'top-left';
    return el.localName === 'video' ? 'top-right' : 'bottom-right';
  }

  function createItem(el) {
    const host = document.createElement('webtune-control');
    host.style.cssText = HOST_STYLE;
    const root = host.attachShadow({ mode: 'open' });
    const sheet = document.createElement('style');
    sheet.textContent = CONTROL_CSS;
    const button = document.createElement('button');
    button.type = 'button';
    root.append(sheet, button);

    const item = { el, host, button, x: 0, y: 0, released: false };
    button.addEventListener('click', (event) => {
      event.preventDefault(); // the media may sit inside a link or button
      event.stopPropagation();
      toggle(item);
    });
    for (const type of STOPPED_EVENTS) host.addEventListener(type, (event) => event.stopPropagation());
    return item;
  }

  function intersect(a, b) {
    if (!b) return a;
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  // The control lives outside the media's own scroll containers, so it is neither scrolled
  // nor clipped by them natively. Returns the area those containers leave visible.
  function clipBounds(el) {
    let bounds = null;
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      if (a.scrollHeight <= a.clientHeight && a.scrollWidth <= a.clientWidth) continue;
      const { overflowX, overflowY } = getComputedStyle(a);
      if (overflowX === 'visible' && overflowY === 'visible') continue;
      bounds = intersect(a.getBoundingClientRect(), bounds);
    }
    return bounds;
  }

  // Reads layout only. Kept apart from place() so a batch never interleaves reads and writes.
  function measure(item) {
    if (item.released || !item.el.isConnected) return null;
    const rect = item.el.getBoundingClientRect();
    const visible = intersect(rect, clipBounds(item.el));
    return {
      item,
      visible,
      origin: item.host.getBoundingClientRect(),
      rendered: rect.width >= MIN_CONTROL_SIZE && rect.height >= MIN_CONTROL_SIZE && visible.width > 0 && visible.height > 0,
    };
  }

  function place({ item, visible, origin, rendered }) {
    const { el, host, button } = item;
    const revealed = el.hasAttribute(REVEALED_ATTR);
    const anchor = anchorFor(el, revealed);
    host.setAttribute(CONTROL_ATTR, revealed ? 'hide' : 'show');
    host.toggleAttribute('data-idle', !rendered);
    button.dataset.anchor = anchor;
    button.textContent = revealed ? 'Hide' : 'Show';
    button.setAttribute('aria-label', `${button.textContent} ${el.localName === 'video' ? 'video' : 'image'}`);
    if (!rendered) return;

    const targetX = anchor.endsWith('right') ? visible.right : visible.left;
    const targetY = anchor.startsWith('bottom') ? visible.bottom : visible.top;
    item.x += targetX - origin.left;
    item.y += targetY - origin.top;
    host.style.setProperty('transform', `translate(${item.x}px, ${item.y}px)`, 'important');
  }

  function flushAlign() {
    frame = 0;
    const batch = [...pending].map(measure).filter(Boolean);
    pending.clear();
    batch.forEach(place);
  }

  function scheduleAlign(item) {
    pending.add(item);
    if (!frame) frame = requestAnimationFrame(flushAlign);
  }

  function toggle(item) {
    const { el } = item;
    if (el.hasAttribute(REVEALED_ATTR)) el.removeAttribute(REVEALED_ATTR);
    else el.setAttribute(REVEALED_ATTR, '');
    const measured = measure(item);
    if (measured) place(measured);
  }

  function track(el) {
    let item = items.get(el);
    if (!item) {
      item = createItem(el);
      items.set(el, item);
      intersectionObserver.observe(el);
    }
    // Also repairs the control's position when the page moved the media elsewhere.
    if (el.previousSibling !== item.host) el.before(item.host);
    scheduleAlign(item);
  }

  function release(el) {
    const item = items.get(el);
    if (!item) return;
    item.released = true;
    intersectionObserver?.unobserve(el);
    item.host.remove();
    el.removeAttribute(REVEALED_ATTR);
    pending.delete(item);
    items.delete(el);
  }

  function onMutations(records) {
    // Removals first. Media that was only moved is still connected and is kept.
    for (const record of records) {
      for (const node of record.removedNodes) {
        for (const el of mediaIn(node)) {
          if (!el.isConnected) release(el);
        }
      }
    }
    for (const record of records) {
      for (const node of record.addedNodes) {
        for (const el of mediaIn(node)) {
          if (el.isConnected) track(el);
        }
      }
    }
  }

  function onIntersection(entries) {
    for (const entry of entries) {
      const item = items.get(entry.target);
      if (item) scheduleAlign(item);
    }
  }

  // Media size can change after load (lazy images, video metadata); realign the button.
  function onMediaLoad(event) {
    const item = items.get(event.target);
    if (item) scheduleAlign(item);
  }

  function onResize() {
    items.forEach(scheduleAlign);
  }

  // Scroll events do not bubble, so they are captured. Window scrolling needs no work:
  // the controls scroll with the document.
  function onScroll(event) {
    const scroller = event.target;
    if (scroller === document || scroller.nodeType !== Node.ELEMENT_NODE) return;
    for (const item of items.values()) {
      if (scroller.contains(item.el)) scheduleAlign(item);
    }
  }

  function enable() {
    style.set(PAGE_CSS);
    mutationObserver = new MutationObserver(onMutations);
    intersectionObserver = new IntersectionObserver(onIntersection);
    for (const el of document.querySelectorAll(MEDIA_SELECTOR)) track(el);
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('load', onMediaLoad, true);
    document.addEventListener('loadedmetadata', onMediaLoad, true);
  }

  function disable() {
    mutationObserver.disconnect();
    intersectionObserver.disconnect();
    mutationObserver = null;
    intersectionObserver = null;
    window.removeEventListener('resize', onResize);
    document.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('load', onMediaLoad, true);
    document.removeEventListener('loadedmetadata', onMediaLoad, true);
    for (const el of [...items.keys()]) release(el);
    style.clear();
  }

  function setEnabled(next) {
    if (next === enabled) return;
    enabled = next;
    if (enabled) enable();
    else disable();
  }

  globalThis.WebTune = { ...globalThis.WebTune, media: { setEnabled } };
})();
