// Global font-size override. A single stylesheet forces one px size on every element
// below <html>. <html> is left alone so rem-based spacing keeps its original size,
// which limits layout breakage. Dynamic content needs no observer: CSS covers it.
(() => {
  const { SCOPE, create } = WebTune.style;
  const style = create('webtune-font-style');

  function css(size) {
    return `${SCOPE} *, ${SCOPE} *::before, ${SCOPE} *::after { font-size: ${size}px !important; }`;
  }

  function apply({ enabled, size }) {
    if (enabled) style.set(css(size));
    else style.clear();
  }

  globalThis.WebTune = { ...globalThis.WebTune, font: { apply } };
})();
