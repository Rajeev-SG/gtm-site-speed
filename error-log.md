# Error & Resolution Log for GTM Site Speed Project

This file captures the sequence of build/runtime errors encountered during development of the `audit` API route and how each was resolved.

---

## 1. SWC / Webpack parse error on `puppeteer-core`
```
Module parse failed: Unexpected token  (#$$ private fields)
Import trace: puppeteer-core → lighthouse → app/api/audit/route.ts
```
**Root cause:** Next.js tried to bundle `puppeteer-core`, whose ESM build includes new-style JavaScript private fields that SWC cannot parse by default.

**Fix:**
1. Removed the explicit `import puppeteer-core` and all related page-automation code.
2. Marked `puppeteer-core` as an external in `next.config.js` so it is never bundled on the server.

---

## 2. TypeScript errors in `route.ts`
* `Module 'chrome-launcher' has no default export`
* `Property 'lhr' does not exist on type 'RunnerResult | undefined'`
* `Variable 'runs' implicitly has an 'any[]' type`

**Fix:**
* Used `import { launch } from 'chrome-launcher'` instead of default import.
* Added explicit generic types or cast (`runnerResult as any`) for the Lighthouse return value.
* Declared `runs: Awaited<ReturnType<typeof auditOnce>>[]`.

---

## 3. SWC errors still appearing via Lighthouse → puppeteer-core
Even after removing direct `puppeteer-core` imports the same parse error surfaced because Lighthouse depends on it.

**Fix:** Added `puppeteer-core` to the `externals` array inside the `webpack` override of `next.config.js`.

---

## 4. ESM vs CJS clash (chrome-launcher CLI)
Running `npx chrome-launcher` produced
```
Error [ERR_REQUIRE_ESM]: require() of ES Module chrome-launcher/dist/chrome-launcher.js not supported.
```
**Fix:** Stopped using the CLI; inside `route.ts` switched to dynamic import:
```ts
const { launch } = await import(/* webpackIgnore: true */ 'chrome-launcher');
```
This avoids CommonJS `require()` entirely.

---

## 5. Syntax issues introduced while refactoring
* Duplicate `lhr` declaration
* Extra parenthesis causing `',' expected`

**Fix:** Removed redundant `const { lhr }` and fixed paren placement.

---

## 6. `ERR_REQUIRE_ESM` when Lighthouse loaded on server
```
Error [ERR_REQUIRE_ESM]: require() of ES Module lighthouse/core/index.js … not supported.
```
**Root cause:** Even with externals, Next.js tried to `require()` Lighthouse because dynamic import got bundled.

**Fix:**
* Converted `import('lighthouse')` and `import('chrome-launcher')` to
  `import(/* webpackIgnore: true */ 'lighthouse')` (and same for chrome-launcher), instructing Webpack to leave them untouched.
* Added both packages to `externals` list.

---

## 7. Generic unknown-type error handling
ESLint/TS flagged:
```
'error' is of type 'unknown'.
```
**Fix:** Cast `error` to `Error | string` with `String(error)` fallback.

---

## Current Status
* Dev server builds without SWC/webpack errors.
* API route dynamically loads Lighthouse + Chrome-launcher at runtime, bypassing bundler limitations.
* Remaining functionality issues (if any) now surface as runtime console logs rather than build failures.

---

*Last updated:* 2025-08-03
