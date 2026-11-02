# WebTune V1 — Test Report

**Project:** WebTune — Customize Your Web
**Version:** 1.0.0 (Manifest V3, vanilla JS)
**Test Date:** 2026-11-02
**Environment:** Linux, Node 24.22, Playwright 1.64.1 driving Playwright's Chromium (build 1248, new headless) with the unpacked extension loaded. Branded Google Chrome 156 is installed on the machine but cannot be used for automation (Chrome 137+ ignores `--load-extension`).

| | |
|---|---|
| **Total tests** | 131 cases (128 unique automated cases = 141 executions, 1 ad-hoc, 2 manual) |
| **Passed** | 129 |
| **Failed** | 0 |
| **Blocked** | 2 (MANUAL-001, load in branded Chrome UI; MANUAL-002, native context menu) |
| **Needs clarification** | 0 (the two open questions were asked up front and answered: uniform font size, no Settings row) |

Run with `npm test` (`npm run test:unit`, `npm run test:e2e`). Details per case: [TEST_CASES.md](TEST_CASES.md).

## Results by area

- **Unit/Logic:** 21/21 pass. Settings defaults, sanitising of corrupt/out-of-range values, write allow-list, `onChange` filtering, plus static security checks, plus the Word Counter counting rules (English, Bangla, mixed, numbers, punctuation, whitespace, edge cases, 100,000 words).
- **Browser/E2E:** 120/120 pass. Real extension in real Chromium: popup UI, content scripts, storage sync into open tabs, Show/Hide, video behaviour, background images, dynamic content, SPA replacement, scroll containers, persistence incl. full browser restart, font override at all 7 sizes across rem/em/px/`var()`/vw/inline/`!important`, and Copy Protection Override (selection, right-click, copy/cut/paste with real clipboard read-back, shortcuts, dynamic content, SPA, same/cross-origin iframes, open shadow DOM, toggling, OFF-state regression, coexistence with media and font), and Word Counter (count shown for DOM/mouse/text-field selections, Bangla, large selections, dynamic content, OFF removing the menu item, rapid toggles, persistence across a browser restart, coexistence with Copy Protection).
- **Ad-hoc real sites (not in the suite):** Wikipedia, BBC News, Hacker News, MDN. All media hidden, page dimensions identical ON vs OFF, font override applied, OFF fully restored, no errors.
- **Performance:** blocking N images, from storage change until every control is placed: 10 → 23 ms, 100 → 27 ms, 500 → 67 ms, 2000 → 182 ms. Main-thread long tasks: 0 ms in all runs. After settling, WebTune produces **zero** DOM mutations (no observer feedback loop); 200 images inserted in bursts yield exactly 200 controls (no duplicates); 20 rapid ON/OFF toggles leave the page clean. Font override = one `<style>` element, no DOM writes, no observer. Copy Protection Override = one `<style>` plus a fixed set of listeners; on a 1000-block page: only the `<style>` insertion, 0 mutations when idle, no observer, clipboard never read by the extension.
- **Security/Privacy:** permissions are `["storage", "contextMenus"]` only; no host permissions; the only background code is the service worker for the Word Counter menu; content scripts match `http://*/*` and `https://*/*` only. No `fetch`/XHR/WebSocket/`eval`/`new Function`/remote URLs/`localStorage`/cookies/`tabs`/`history` anywhere in the source. Storage holds only `mediaBlocking`, `fontOverride`, `fontSize`, `copyProtection`, `wordCounter`; selected text and counts are never stored or logged (only a number is sent to the service worker); individual reveal state is never stored (verified).

## Bugs found and fixed

| # | Severity | Bug | Fix | Regression test |
|---|---|---|---|---|
| 1 | Medium | A Show/Hide control for an image inside a non-positioned scroll container (carousel, scrollable list) neither scrolled with the image nor was clipped by the container, so it floated over the page. | Realign on element `scroll` events; anchor the button to the *visible* part of the image; hide it when the image is fully clipped. | EDGE-003 |
| 2 | Low | Popup briefly showed unsynced HTML defaults (slider at 24, label 16px, switches OFF) before saved settings loaded. | Popup is invisible (but laid out) until first render of saved state. | POPUP-001 |
| 3 | Low (cleanup) | Control host used `all: initial`, which Chrome expands into a ~5 KB inline `style` per control. | Replaced with a short explicit reset. | MEDIA-001…003 |

Two *test* defects were also corrected (not product bugs): SECURITY-004 flagged the manifest's `http://*/*` match patterns as remote URLs, and two sloppy assertions were rewritten before first run.

## Critical failures
None.

## High priority issues
None.

## Medium priority issues
None open. (Bug 1 above is fixed.)

## Low priority issues / Known limitations

1. **Shadow DOM.** `<img>`/`<video>` and backgrounds inside shadow roots are not blocked, because document-level CSS does not reach them (sites built heavily on web components).
2. **Other media forms are out of V1 scope** and stay visible: inline `<svg>`, `<canvas>`, `<iframe>` embeds, `<input type=image>`, and CSS `mask-image`, `border-image`, `list-style-image`, `content:url()`. (`<picture>` is covered through its `<img>`.)
3. **Playing videos keep playing.** Hiding is `visibility:hidden`, and per the spec playback is not touched: an autoplaying (muted) or already-playing video continues underneath while hidden.
4. **Network requests are not blocked** (by spec): hidden images still download.
5. **Possible first-paint flash.** Settings are read asynchronously at `document_start`; on a page load with blocking ON, media could paint for a few ms before the stylesheet is applied. Not observed in tests, but not guaranteed.
6. **Control placement.** Each control is a zero-size `<webtune-control>` inserted immediately before its media element. Page CSS that depends on sibling position (`x + img`, `img:first-child`) or frameworks that strictly reconcile children could be affected. Media rendered under 8×8 px (tracking pixels) gets no visible button.
7. **Uniform font mode** (as chosen): heading hierarchy is flattened; `font-size:0` hacks, icon fonts sized by `font-size`, and fixed-`px` line-heights may look off; an inline `style="font-size:… !important"` would still win. `<html>` is intentionally excluded so rem-based spacing keeps its size.
8. **Only http(s) pages.** `file://`, `chrome://`, the Web Store and other extension pages are not touched.
9. **Popup "Settings" row omitted** (confirmed with the requester).
10. **Copy Protection Override** (see project-plan.md section 37):
    - Pages with their own copy/paste/context-menu/shortcut handling (online editors, spreadsheets, custom right-click menus) lose those handlers while it is ON, because they cannot be told apart from blocking ones. OFF by default for that reason.
    - Inline `style="user-select:none !important"` cannot be beaten by a stylesheet (LIMIT-COPY-001).
    - Open shadow roots: events are handled, but `user-select:none` inside them stays (document CSS does not reach in); closed roots are not touched (SHADOW-COPY-001).
    - Listeners attach when the saved setting is applied; a page capture listener on `window` registered earlier runs first.
    - Not handled: overlays covering text, selection-clearing scripts, left-button `mousedown` selection blockers, canvas/image text, DRM; `dragstart` is deliberately left alone. Frames not matching http(s) (`about:srcdoc`, `blob:`) are not covered.
    - The native context menu cannot be observed in headless Chromium: CONTEXT-001 asserts that page handlers no longer run and the event is not cancelled.

11. **Word Counter**:
    - Counting uses `Intl.Segmenter` (Unicode word boundaries). Chosen behaviour: numbers are one word (`10,000`, `3.14`, `2026`); apostrophes stay inside a word (`don't` = 1); hyphenated and dashed words are two (`Hello-world`, `Hello—world` = 2); `example.com` = 1, `https://example.com/a` = 3, `a@b.com` = 2; emoji and punctuation never count; CJK uses the ICU dictionary (`你好世界` = 2).
    - The count is sent about 150 ms after the selection settles (not at right-click time), so the menu title is ready before the menu opens. A right-click within 150 ms of selecting could show the previous count.
    - There is one menu title shared by all tabs and frames. Selecting in another tab or frame moves it; it is refreshed when the page regains focus.
    - A selection with no words (whitespace, punctuation) hides the item instead of showing `Word Count: 0`; an empty selection never shows it (`contexts: ["selection"]`).
    - The item exists only on pages where the content script runs (http/https). The native menu cannot be observed headless (MANUAL-002).

## Not verified
- **MANUAL-002 (BLOCKED):** reading `Word Count: N` in Chrome's real right-click menu. Headless Chromium cannot show it; the automated tests assert what the service worker passes to `chrome.contextMenus.update()`.
- **MANUAL-001 (BLOCKED):** loading through `chrome://extensions → Load unpacked` in branded Chrome. Same manifest and code run in Chromium; please do this 2-minute check once.

## Final Recommendation

**READY WITH KNOWN ISSUES** — all practical automated tests pass and the known limitations above are inherent to the V1 spec/approach. Ready for manual QA; do the one manual load check in regular Chrome.
