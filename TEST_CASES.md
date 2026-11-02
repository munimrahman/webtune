# WebTune V1 — Test Cases

Generated from the actual run of `npm test` (Node test runner + Playwright, Chromium with the unpacked extension loaded). Statuses are results of that run.
Each section lists the shared **Preconditions** and **Steps**; each row is one test case with its scenario/expected result, actual result and status.
Parametrised cases (same ID run at several sizes) are one row.

## Settings (unit)

- **Preconditions:** Mocked chrome.storage.local (unit test).
- **Steps:** Call WebTune.storage functions with the scenario input.
- **Fixture:** webtune/src/utils/storage.js

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| SETTINGS-001 | fresh install defaults | Behaved as expected | PASS |  |
| SETTINGS-002 | stored values override defaults, missing keys keep defaults | Behaved as expected | PASS |  |
| SETTINGS-003 | corrupt stored values fall back to defaults | Behaved as expected | PASS |  |
| SETTINGS-004 | out-of-range font sizes are rejected | Behaved as expected | PASS |  |
| SETTINGS-005 | set() only persists known settings keys | Behaved as expected | PASS |  |
| SETTINGS-006 | onChange reports only changed settings from the local area | Behaved as expected | PASS |  |
| SETTINGS-007 | copyProtection is a strict boolean that defaults to false | Behaved as expected | PASS | Added with Copy Protection Override. |
| WORD-PERSIST-000 | wordCounter is a strict boolean that defaults to true | Behaved as expected | PASS | Added with Word Counter; the only setting that defaults to ON. |

## Permissions, privacy & security (static)

- **Preconditions:** Static inspection of the extension folder.
- **Steps:** Parse manifest.json; scan all source for network APIs, dynamic code, remote URLs, tracking storage.
- **Fixture:** webtune/ source tree

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| SECURITY-001 | manifest is MV3 and requests only the storage and contextMenus permissions | Behaved as expected | PASS | Updated deliberately for Word Counter (`contextMenus`). |
| SECURITY-002 | content scripts match only http(s), never <all_urls> | Behaved as expected | PASS |  |
| SECURITY-003 | the only background code is the module service worker; no externally_connectable | Behaved as expected | PASS | Updated deliberately for Word Counter. |
| SECURITY-004 | no network APIs, dynamic code or remote resources in source | Behaved as expected | PASS | Test false positive corrected: manifest match patterns (http://*/*) are not requests, so manifest.json is exempt from the URL rule only. |
| SECURITY-005 | only the five global settings are ever written to storage | Behaved as expected | PASS | Pattern updated deliberately for `copyProtection: false` and `wordCounter: true`. |

## Default state

- **Preconditions:** Fresh Chromium profile with WebTune loaded, empty chrome.storage.local.
- **Steps:** Open media.html without touching any setting; inspect media, backgrounds, WebTune elements and storage.
- **Fixture:** media.html

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| DEFAULT-001 | fresh install: media is untouched and no WebTune UI exists | Behaved as expected | PASS |  |

## Media blocking — images

- **Preconditions:** WebTune loaded; mediaBlocking turned ON through chrome.storage.local while the page is open.
- **Steps:** Open fixture; enable blocking; interact with the Show/Hide buttons exactly as the scenario states; inspect computed visibility/geometry.
- **Fixture:** media.html (MEDIA-006: many.html?n=100)

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| MEDIA-001 | blocking ON hides every <img> and gives each a small Show button | Behaved as expected | PASS |  |
| MEDIA-002 | Show buttons are small, subtle and sit on the hidden image | Behaved as expected | PASS |  |
| MEDIA-003 | hiding keeps layout: nothing shifts when blocking is turned on | Behaved as expected | PASS |  |
| MEDIA-004 | Show reveals only that image, then Hide restores it | Behaved as expected | PASS |  |
| MEDIA-005 | five images are independently controllable (alternating) | Behaved as expected | PASS |  |
| MEDIA-006 | 100 images stay independent through repeated show/hide | Behaved as expected | PASS |  |
| MEDIA-007 | Show/Hide clicks do not trigger links or page click handlers | Behaved as expected | PASS |  |
| MEDIA-008 | normal page interactions keep working while blocking is ON | Behaved as expected | PASS |  |

## CSS background images

- **Preconditions:** WebTune loaded; fixture with background-image set via longhand, shorthand, !important rule and ::before.
- **Steps:** Enable blocking; read computed background-image; look for controls; disable blocking.
- **Fixture:** media.html

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| BG-001 | background-image is hidden while ON (longhand, shorthand, !important, pseudo-element) | Behaved as expected | PASS |  |
| BG-002 | background elements get no Show/Hide control and cannot be revealed | Behaved as expected | PASS |  |
| BG-003 | background-image returns when blocking is turned OFF | Behaved as expected | PASS |  |

## Global toggle & state

- **Preconditions:** WebTune loaded; media.html open.
- **Steps:** Toggle global blocking through storage, reveal individual media, reload, inspect DOM and storage.
- **Fixture:** media.html

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| GLOBAL-001 | OFF → ON → OFF → ON: full restore, controls vanish, reveal state is not remembered | Behaved as expected | PASS |  |
| GLOBAL-002 | individual reveal state is never written to storage | Behaved as expected | PASS |  |
| GLOBAL-003 | reload with blocking ON blocks again; revealed media does not persist | Behaved as expected | PASS |  |

## Video behaviour

- **Preconditions:** WebTune loaded; videos with controls / without controls / poster / autoplay+muted+loop / missing source.
- **Steps:** Snapshot video attributes and properties, enable blocking, Show/Hide, compare snapshots, inspect playback state.
- **Fixture:** media.html

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| VIDEO-001 | videos are hidden with Show buttons; Show reveals only that video | Behaved as expected | PASS |  |
| VIDEO-002 | revealed video keeps its original attributes, controls, muted/autoplay and source | Behaved as expected | PASS |  |
| VIDEO-003 | Show does not start playback; native controls still work | Behaved as expected | PASS | Native control bar verified by clicking the revealed video, which toggles playback. |
| VIDEO-004 | Hide button on a video avoids the native control bar (top-right) | Behaved as expected | PASS |  |
| VIDEO-005 | video poster is hidden together with the video | Behaved as expected | PASS |  |

## Edge cases

- **Preconditions:** WebTune loaded; blocking ON.
- **Steps:** Open edge-case fixture; exercise the scenario (broken URL, tiny image, scroll container, display:none, fixed element).
- **Fixture:** edge.html

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| EDGE-001 | broken, src-less and native-lazy images are blocked and controllable | Behaved as expected | PASS |  |
| EDGE-002 | 1x1 tracking pixels get no visible button | Behaved as expected | PASS | Design choice: media rendered under 8x8px gets no visible button. |
| EDGE-003 | media inside a scroll container: button follows the image and is clipped with it | Behaved as expected | PASS | Found a real bug: controls were not scrolled/clipped with images inside non-positioned scroll containers. Fixed (scroll listener + clipped anchor); this test is its regression test. |
| EDGE-004 | media far below the fold gets a correctly placed button after scrolling | Behaved as expected | PASS |  |
| EDGE-005 | media that starts display:none gets a button once it is displayed | Behaved as expected | PASS |  |
| EDGE-006 | fixed-position page elements are not affected | Behaved as expected | PASS |  |

## Rapid toggles / race conditions

- **Preconditions:** WebTune loaded; media.html open.
- **Steps:** Fire the rapid toggle sequence with no waits, then inspect final DOM state and control count.
- **Fixture:** media.html

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| RACE-001 | rapid global ON/OFF/ON/OFF/ON ends ON with exactly one control per media | Behaved as expected | PASS |  |
| RACE-002 | rapid Show/Hide on one element leaves a single consistent control | Behaved as expected | PASS |  |

## Dynamic content

- **Preconditions:** WebTune loaded; settings changed while the page is open.
- **Steps:** Use fixture helpers to insert/replace/move/remove content after load; inspect result.
- **Fixture:** dynamic.html (DYNAMIC-011: font.html)

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| DYNAMIC-001 | images inserted after load are hidden and get one Show button when ON | Behaved as expected | PASS |  |
| DYNAMIC-002 | videos inserted after load are hidden and controllable | Behaved as expected | PASS |  |
| DYNAMIC-003 | media inside a freshly created container tree is picked up | Behaved as expected | PASS |  |
| DYNAMIC-004 | media inserted while OFF is untouched, and picked up when blocking turns ON | Behaved as expected | PASS |  |
| DYNAMIC-005 | dynamically added background-image is hidden with no control | Behaved as expected | PASS |  |
| DYNAMIC-006 | lazy-loaded image (src assigned later) stays blocked and controllable | Behaved as expected | PASS |  |
| DYNAMIC-007 | SPA view replacement: old controls are cleaned up, new media is blocked | Behaved as expected | PASS |  |
| DYNAMIC-008 | removing media removes its control (no stale controls) | Behaved as expected | PASS |  |
| DYNAMIC-009 | moving revealed media keeps it revealed and its control follows | Behaved as expected | PASS | Moving a revealed element keeps it revealed (not re-hidden). |
| DYNAMIC-010 | burst of 200 inserted images: one control each, no duplicates | Behaved as expected | PASS |  |
| DYNAMIC-011 | font override applies to dynamically added text | Behaved as expected | PASS |  |
| DYNAMIC-012 | font override survives SPA view replacement | Behaved as expected | PASS |  |
| DYNAMIC-013 | no uncaught page errors | Behaved as expected | PASS |  |

## Font override

- **Preconditions:** WebTune loaded; fontOverride/fontSize set via storage.
- **Steps:** Open font.html (rem/em/px/var()/vw/inline/!important sizing); apply the scenario; read computed font-size.
- **Fixture:** font.html (FONT-010: media.html)

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| FONT-001 | default: override OFF leaves original sizes untouched | Behaved as expected | PASS |  |
| FONT-002 | a saved size with override OFF changes nothing | Behaved as expected | PASS |  |
| FONT-003 | 12px is applied to headings, paragraphs, nav, lists, cards, forms, buttons, tables (all CSS techniques) (×7) | Behaved as expected in all 7 runs | PASS | Parametrised: 12, 14, 16, 18, 20, 22, 24px. |
| FONT-004 | inline-style and !important site rules are overridden | Behaved as expected | PASS |  |
| FONT-005 | pseudo-elements follow the override | Behaved as expected | PASS |  |
| FONT-006 | layout guard: <html> font size and rem-based spacing are left alone | Behaved as expected | PASS |  |
| FONT-007 | reversibility: 18 → 24 → 14 → OFF returns exactly to the original | Behaved as expected | PASS | Verifies DOM is byte-identical after OFF: no inline styles or attributes were added at any time. |
| FONT-008 | font override never writes to the page DOM besides one <style> | Behaved as expected | PASS |  |
| FONT-009 | changing size repeatedly keeps a single stylesheet | Behaved as expected | PASS |  |
| FONT-010 | media and font features work together and independently | Behaved as expected | PASS |  |
| FONT-011 | no uncaught page errors | Behaved as expected | PASS |  |

## Popup

- **Preconditions:** WebTune loaded; popup opened as an extension page.
- **Steps:** Read popup state, click controls, observe storage and open pages.
- **Fixture:** popup.html + media.html / many.html

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| POPUP-001 | popup opens with fresh-install defaults | Behaved as expected | PASS | Found a real bug: popup flashed unsynced HTML defaults before storage loaded. Fixed (body hidden until first render); helper now waits for body.ready. |
| POPUP-002 | popup reflects previously saved settings | Behaved as expected | PASS |  |
| POPUP-003 | toggles, Hide/Show Media buttons and slider write the right values to storage | Behaved as expected | PASS |  |
| POPUP-004 | slider offers exactly 12–24px in steps of 2 | Behaved as expected | PASS |  |
| POPUP-005 | popup stays in sync when settings change elsewhere | Behaved as expected | PASS |  |
| POPUP-006 | popup changes update an already-open page without a reload | Behaved as expected | PASS |  |
| POPUP-007 | changes apply to every open tab | Behaved as expected | PASS |  |
| POPUP-008 | no console or page errors in the popup or content scripts | Behaved as expected | PASS |  |

## Persistence

- **Preconditions:** WebTune loaded.
- **Steps:** Change settings through the popup, reload pages, re-open popup, or restart the browser with the same profile.
- **Fixture:** popup.html + media.html

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| PERSIST-001 | settings survive page reload and a popup re-open | Behaved as expected | PASS |  |
| PERSIST-002 | stored data holds only the three settings (nothing about pages) | Behaved as expected | PASS |  |
| PERSIST-003 | settings survive a full browser restart | Behaved as expected | PASS |  |

## Performance / MutationObserver

- **Preconditions:** WebTune loaded; blocking/override ON.
- **Steps:** Instrument the page with PerformanceObserver(longtask) and MutationObserver; insert N images; wait for idle.
- **Fixture:** many.html / dynamic.html

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| PERF-001 | 10 images: blocked quickly with exactly one control each and no mutation feedback loop (×4) | Behaved as expected in all 4 runs | PASS | Parametrised: 10, 50, 100, 500 images. |
| PERF-002 | continuous dynamic insertion (infinite-scroll style) does not accumulate duplicates or slow down | Behaved as expected | PASS |  |
| PERF-003 | font override on a large page costs one stylesheet and no DOM writes | Behaved as expected | PASS |  |
| PERF-004 | toggling blocking 20 times on 100 images leaves the page clean | Behaved as expected | PASS |  |
| PERF-005 | no errors | Behaved as expected | PASS |  |

## Console / uncaught errors

- **Preconditions:** Run after the other tests of the same file.
- **Steps:** Check the uncaught-error / console-error collector.
- **Fixture:** —

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| ERRORS-001 | no uncaught page errors were produced during media tests | Behaved as expected | PASS |  |

## Copy Protection Override

- **Preconditions:** WebTune loaded; `copyProtection` turned ON through chrome.storage.local (or the popup) while the page is open. Clipboard permissions granted to the fixture origin so real Ctrl+C / Ctrl+X / Ctrl+V results can be read.
- **Steps:** Open a fixture that blocks the feature's target with real-world techniques (CSS `user-select:none`, `document.oncontextmenu`, inline `oncopy="return false"`, `addEventListener` handlers, keydown blockers); first check the page really blocks (OFF), then enable and repeat with real mouse/keyboard input or cancelable dispatched events.
- **Fixture:** copy.html (SPA-COPY-001: copy-spa.html; IFRAME-COPY-001: copy-frame.html; PERF-COPY-001: many-text.html)

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| COPY-000 | default: OFF, nothing injected, only the boolean is stored | Behaved as expected | PASS |  |
| SELECT-001 | text with user-select:none becomes selectable by the mouse when ON | Behaved as expected | PASS | Real triple-click; OFF run proves the fixture blocks it. |
| SELECT-002 | headings, paragraphs, lists, spans, links, `!important` class and inline rules are overridden; buttons are not | Behaved as expected | PASS |  |
| LIMIT-COPY-001 | known limitation: an inline style with `!important` beats any stylesheet | Stays `user-select:none`, as documented | PASS | Pins the documented limitation. |
| CONTEXT-001 | a page that blocks right-click no longer does when ON | Behaved as expected | PASS | Page handlers do not run and the `contextmenu` event is not cancelled; the native menu itself cannot be observed headless. |
| CONTEXT-002 | right-button mousedown/mouseup scripts are neutralised, left clicks still reach the page | Behaved as expected | PASS |  |
| COPY-001 | user-initiated Ctrl+C copies the selection on a page that blocks copy | Behaved as expected | PASS | Real clipboard read-back; OFF leaves the clipboard unchanged. |
| COPY-002 | copy and beforecopy page handlers are neutralised | Behaved as expected | PASS |  |
| COPY-003 | cut works in a field whose page blocks it | Behaved as expected | PASS |  |
| COPY-004 | paste works in a field whose page blocks it | Behaved as expected | PASS |  |
| COPY-005 | copying out of an input whose page blocks oncopy works | Behaved as expected | PASS |  |
| KEYBOARD-001 | a page that blocks Ctrl+A / Ctrl+C regains normal browser behaviour | Behaved as expected | PASS |  |
| KEYBOARD-002 | only the four clipboard shortcuts are touched: other keys and Ctrl+Shift combos still reach the page | Behaved as expected | PASS |  |
| DYNAMIC-COPY-001 | content added after load is selectable, right-clickable and copyable | Behaved as expected | PASS |  |
| DYNAMIC-COPY-002 | content added while the feature is OFF is protected, then freed the moment it is turned ON | Behaved as expected | PASS |  |
| SPA-COPY-001 | the feature stays active across pushState navigation without a reload | Behaved as expected | PASS | Includes back navigation; a marker proves no document reload. |
| IFRAME-COPY-001 | same-origin and cross-origin frames are handled by their own content script | Behaved as expected | PASS | `127.0.0.1` parent with a `localhost` frame; no cross-frame access. |
| SHADOW-COPY-001 | open shadow DOM: page handlers are neutralised, but document CSS cannot reach into it | Events handled; `user-select` inside the shadow root stays `none` | PASS | Documented limitation. |
| TOGGLE-COPY-001 | OFF → ON → OFF → ON updates the page each time with no accumulation; 20 rapid toggles settle on the last value | Behaved as expected | PASS |  |
| REGRESSION-COPY-002 | OFF leaves the site exactly as it is (selection, menu, clipboard events, shortcuts) | Behaved as expected | PASS | Checked after an ON → OFF round trip. |
| REGRESSION-COPY-001 | coexists with media blocking and font override | Behaved as expected | PASS | Revealed/hidden media, controls and font size unchanged through ON and OFF. |
| PERSIST-COPY-001 | a saved ON state is applied on page load | Behaved as expected | PASS |  |
| PERF-COPY-001 | one stylesheet, no DOM writes and no observer: a 1000-block page stays quiet | Behaved as expected | PASS | Only the `<style>` insertion; 0 mutations when idle. |
| POPUP-COPY-001 | popup switch updates an open page without reload and persists the boolean | Behaved as expected | PASS |  |
| ERRORS-COPY-001 | no uncaught page errors | Behaved as expected | PASS |  |

## Word Counter

- **Preconditions:** WebTune loaded; `wordCounter` is ON by default. Playwright cannot see Chrome's native context menu, so the e2e tests spy on the service worker's `chrome.contextMenus.update()` calls (title and visibility) and check whether the menu item exists.
- **Steps:** Select text with a DOM range, real triple-click or a text-field selection; wait for the service worker to receive the count; assert the title it sets. Unit rows call the counting function directly.
- **Fixture:** words.html (WORD-COPY-001: copy.html); unit: webtune/src/content/features/wordCounter.js

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| WORD-000 | default: ON, one menu item exists and only the boolean setting is stored | Behaved as expected | PASS |  |
| WORD-001 | basic count: `Hello world this is WebTune` → `Word Count: 5` | Behaved as expected | PASS | Unit + e2e. |
| WORD-002 | punctuation never creates words; `I have 500 books.` → 4 | Behaved as expected | PASS | Unit + e2e. |
| WORD-003 | spaces, tabs, newlines and inline elements never create extra words | Behaved as expected | PASS | Unit + e2e. |
| WORD-BN-001 / WORD-UNICODE-001 | `আমি বাংলায় লিখছি।` → 3; `আমি WebTune ব্যবহার করছি।` → 4; Cyrillic, accents, CJK | Behaved as expected | PASS | Unit + e2e. |
| WORD-NUMBER-001 | numbers count as one word each: `2026`, `500`, `10,000`, `3.14`, `১২৩` | Behaved as expected | PASS | Unit. |
| WORD-EDGE-001 | documented ambiguous cases: apostrophes, hyphens, em dash, URLs, emails, emoji | Behaved as expected | PASS | Unit. See the behaviour table in TEST_REPORT.md. |
| WORD-004 | changing the selection updates the count, no stale value (5 → 10 → 5) | Behaved as expected | PASS |  |
| WORD-004b | a real mouse triple-click selection is counted | Behaved as expected | PASS |  |
| WORD-005 | empty selection sends nothing; a whitespace/punctuation-only selection hides the item instead of showing `0` | Behaved as expected | PASS |  |
| WORD-006 / WORD-LARGE-001 | 1, 10, 100, 1,000 and 12,450 words give the right title with a thousands separator; counting 100,000 words stays under 1 s | Behaved as expected | PASS | Unit + e2e. |
| WORD-007 | content inserted by script and selections inside a `<textarea>` are counted | Behaved as expected | PASS |  |
| WORD-008 | OFF removes the menu item and no count is calculated or sent; ON restores it | Behaved as expected | PASS | |
| WORD-008b | 10 rapid toggles settle on the last value (no duplicate-id errors) | Behaved as expected | PASS | Menu sync is serialised in the service worker. |
| WORD-010 | the `contextmenu` event is not cancelled and WebTune injects no UI | Behaved as expected | PASS | The native menu itself is checked manually (MANUAL-002). |
| WORD-COPY-001 | works together with Copy Protection ON on a page that blocks selection, including a right-click | Behaved as expected | PASS |  |
| WORD-REGRESSION-001 | font size is untouched, font override still works, no page errors | Behaved as expected | PASS |  |
| WORD-POPUP-001 | popup switch defaults ON, writes only the boolean and removes/restores the menu item | Behaved as expected | PASS |  |
| WORD-PERSIST-001 | OFF survives a full browser restart (menu not re-created); ON restores it | Behaved as expected | PASS |  |

## Not covered by the automated suite

| Test ID | Scenario / Expected result | Actual result | Status | Notes |
|---|---|---|---|---|
| COMPAT-001 | Ad-hoc run on real sites (Wikipedia "Cat", MDN video page, BBC News, Hacker News): all <img>/<video> hidden with controls, page scroll width/height unchanged, font override applies, OFF fully restores (no controls, no style elements, nothing hidden), no extension errors. | Wikipedia: 63/63 media hidden, 63 controls; BBC: 26/26; HN: 2/2; MDN: no <img>/<video> in the page itself (examples live in iframes). Dimensions identical ON vs OFF, 0 errors. | PASS | Ad-hoc script, not part of the offline suite (depends on internet). |
| MANUAL-001 | Load the folder via chrome://extensions → Developer mode → Load unpacked in branded Google Chrome and open the popup. | Not run. Branded Chrome 137+ ignores `--load-extension`, so it cannot be automated; the identical MV3 manifest loads and runs in Playwright's Chromium. | BLOCKED | Needs a 2-minute manual check by a human. |
| MANUAL-002 | In real Chrome: select text, right-click, read `Word Count: N` in the native menu; change the selection and right-click again; right-click with nothing selected (no item); toggle the popup switch. | Not run. Headless Chromium cannot show the native menu, so only the data passed to `chrome.contextMenus` is automated. | BLOCKED | Needs a 2-minute manual check by a human. |

**Summary:** 128 unique automated test cases (141 test executions): 128 PASS, 0 FAIL. Plus 1 ad-hoc PASS and 2 BLOCKED manual cases.
