// Helper for feature-owned <style> elements. Removing the element fully reverts a feature.
(() => {
  // `:not(#id)` raises specificity (1,0,1) so our !important rules beat typical
  // site rules, including site rules that use !important with class selectors.
  const SCOPE = 'html:not(#webtune)';

  function create(id) {
    let element = null;
    return {
      set(css) {
        if (!element) {
          element = document.createElement('style');
          element.id = id;
        }
        if (element.textContent !== css) element.textContent = css;
        if (!element.isConnected) document.documentElement.append(element);
      },
      clear() {
        element?.remove();
        element = null;
      },
    };
  }

  globalThis.WebTune = { ...globalThis.WebTune, style: { SCOPE, create } };
})();
