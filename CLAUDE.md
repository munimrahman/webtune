# WebTune — Customize Your Web

WebTune is a lightweight, local-only Chrome extension (Manifest V3) that lets users customize how every webpage looks and behaves. It is a **growing feature collection**, not a two-feature product: V1 ships Global Media Control and Global Font Size Control (Copy Protection Override and Word Counter were added after V1), and more customization features will be added over time as the owner needs them. Every decision should keep adding a feature cheap and safe for the features already there.

Specs: [project-plan.md](project-plan.md) (V1 product spec) and [test-instruction.md](test-instruction.md) (QA process). Results: [TEST_CASES.md](TEST_CASES.md), [TEST_REPORT.md](TEST_REPORT.md) (includes the known V1 limitations).

## How to work

These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear (design, behaviour, data, a URL, a new dependency),
  stop. Name what's confusing. Ask before writing code.

### Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or configurability that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

The test: would a senior engineer call this overcomplicated? If yes, simplify.

### Surgical changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that _your_ changes orphaned. Leave
  pre-existing dead code.

The test: every changed line traces directly to the user's request.

### Write in English

Code, documentation, code comments, commit messages, PR descriptions and all UI
copy: English, always. Replies to Munim in chat: Banglish. If you find Banglish
(romanized Bengali) comments while working, convert them to English as part of
your changes.

### Fieldnotes

When a decision, reversal, wrong assumption, non-obvious root cause, deliberate
rule break, surprising measurement, or direction-changing pushback occurs, end
the turn with one line: `Worth logging — /log?`. Never write to `worklog/`
unprompted. `worklog/` is gitignored in every repo.

### Verify, don't assume

Turn the task into a checkable goal, then loop until it passes.

- Run the repo's own checks (`npm test`; commands below). These are yours to
  run freely — no need to ask first.
- **UI/visual change:** once the checks are green, verify it in a headless
  browser yourself before reporting: render the page, compare text and box
  positions/sizes and screenshots, and fix until they match. Then tell Munim
  it's ready and say what to look at (popup, fixture page, or real site).

For multi-step work, state the plan up front with a check per step:

```
1. [step] → verify: [check]
2. [step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work")
force round-trips.

## Project rules

- **Roadmap ideas are not tasks.** Per-site settings, autoplay/animation blocking, custom CSS, dark mode, font family, shortcuts, sync, etc. are built only when the owner asks.
- **Stack is fixed:** vanilla JS, HTML, CSS, MV3. No frameworks, TypeScript, bundlers, or runtime dependencies. `package.json` exists only for test tooling.
- **Privacy is a hard rule:** everything runs locally. No network calls, analytics, remote scripts, accounts, or storing URLs/history/page content. Only settings go in `chrome.storage.local` (never `localStorage`/cookies/sync).
- **Permissions:** currently only `storage` + `contextMenus` (Word Counter's native menu item) + content scripts on `http://*/*` and `https://*/*`. Before adding any permission, explain why it is needed, what it allows, and whether a less-privileged alternative exists. Never add `<all_urls>`/`host_permissions`/`tabs` casually. Tests `SECURITY-001`/`002` pin this and must be updated deliberately.

## Layout

- `webtune/` is the unpacked extension — load **this** folder in `chrome://extensions`. It is a subfolder on purpose, so `node_modules` and tests stay out of it (Chrome rejects reserved `_` filenames).
- `webtune/src/utils/` shared code (`storage.js` settings, `style.js` owned-`<style>` helper), `src/content/features/` one file per feature, `src/content/content.js` the entry point, `src/background/` the service worker (`background.js` entry, `features/` browser-API-only features), `src/popup/` the popup.
- `tests/unit` (node:test), `tests/e2e` (Playwright), `tests/pages` (offline fixtures).

## Architecture

- **The service worker exists only for browser-only APIs** (today: Word Counter's `chrome.contextMenus`). The popup writes to `chrome.storage.local`; every content script listens to `storage.onChanged` and updates live (all tabs, all http(s) frames, no reload). Keep features in content scripts unless they genuinely need a browser API only the service worker has. `background.js` is a module that imports `storage.js` and wires settings/messages to `src/background/features/*`; it keeps no state (MV3 suspends it).
- **Content scripts are classic scripts, not ES modules.** They share one namespace, `globalThis.WebTune`; each file is an IIFE doing `globalThis.WebTune = { ...globalThis.WebTune, name: {...} }`. **Load order is defined in `manifest.json` → `content_scripts[0].js`** (utils → features → `content.js`). The popup loads `storage.js` via `<script>`.
- **Features are modules with a tiny interface** (`media.setEnabled(bool)`, `font.apply({enabled,size})`). `content.js` is the only place that wires settings to features. Features must be fully reversible: turning one off removes everything it added (style elements, attributes, nodes, observers, listeners).
- **Prefer CSS over JS for effects.** Both V1 features are an injected `<style>` toggled on/off, so dynamic/SPA content is covered with no per-node work. Use JS observers only for what CSS can't do (the media Show/Hide buttons), and process only added/removed nodes, never rescan the page.
- **CSS specificity:** feature stylesheets prefix selectors with `WebTune.style.SCOPE` (`html:not(#webtune)`) so `!important` rules beat typical site CSS. `<html>` itself is deliberately excluded from font override (keeps rem spacing).
- **Injected UI** (media buttons) is a `<webtune-control>` host with an open shadow root: a zero-size absolutely positioned box moved by `transform`, so it never joins page flow/flex/grid. WebTune nodes are identified by `data-webtune-control` / `data-webtune-revealed`. Layout reads and writes are batched (measure → place) in `requestAnimationFrame`.
- Per-element UI state (e.g. revealed media) is **page-only and never persisted.**

### Adding a new feature (checklist)

1. Add its setting(s) to `DEFAULTS` in `storage.js` and extend `sanitize()` (validate type/range). `set()` and `onChange()` already key off `DEFAULTS`.
2. Create `src/content/features/<name>.js` exposing a small apply/enable function on `WebTune`; reversible and idempotent.
3. Register the file in `manifest.json` (before `content.js`) and call it from `content.js`'s `apply()`.
4. Add its popup section; the popup must render saved state before becoming visible (`body.ready`).
5. Add fixtures in `tests/pages/` and tests in `tests/unit` + `tests/e2e` with IDs like `FEATURE-001`; update `SECURITY-005` (pins the exact defaults) if settings change; update `TEST_CASES.md` and `TEST_REPORT.md`.
6. If the feature needs a permission or changes the settings shape (e.g. per-site settings), **stop and ask** — it is an architecture decision.

## Decisions already made (don't re-litigate)

- Settings are **global** in V1 (no per-site/domain). Defaults: `mediaBlocking:false`, `fontOverride:false`, `fontSize:16` (range 12–24, step 2), `copyProtection:false`, `wordCounter:true` (the only one ON by default).
- **Font override is uniform:** every text element becomes exactly the chosen px (heading hierarchy is flattened) — chosen over proportional scaling.
- Media: `<img>`/`<video>` get individual Show/Hide; CSS `background-image` is hidden globally with **no** individual control. Hiding keeps layout (`visibility:hidden`), does not block network, and does not touch video playback/controls/autoplay/muted/src.
- Media under 8×8px gets no visible button.
- Popup has no "Settings" row (no settings page exists).
- **Word Counter** shows `Word Count: N` in the native right-click menu (no popup/overlay). Counted with `Intl.Segmenter`; the content script sends only the number, ~150 ms after the selection settles, because the title must be updated before the menu opens. Hyphenated words count as two.
- Popup "Hide Media"/"Show Media" buttons and the "Media Blocking" switch are two views of the same `mediaBlocking` boolean.

## Commands

```bash
npm install                        # test tooling only (Playwright)
npx playwright install chromium    # once; branded Chrome 137+ ignores --load-extension
npm test                           # unit + e2e (~25 s)
npm run test:unit
npm run test:e2e                   # serial; each file launches its own Chromium with the extension
node --test tests/e2e/media.test.mjs   # single file
```

## Testing notes

- E2E uses Playwright's **Chromium** (`channel: 'chromium'`, new headless), not branded Chrome. The extension ID is derived from the absolute path of `webtune/` (`extensionIdForPath` in `tests/e2e/helpers.mjs`); there is no service worker to read it from.
- Tests change settings through an extension page (`t.setSettings`) and the real popup UI. Content scripts react asynchronously, so use `eventually(...)`, not fixed sleeps.
- Every fixed bug gets a regression test. Never delete or weaken a test just because it fails — explain a wrong expectation first.
- Manual check owed on each release: Load unpacked in regular Chrome and open the popup.
