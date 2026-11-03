# Quality reports

## axe-core (WCAG 2.0/2.1 A+AA, serious + critical gate)

- Runner: `frontend/scripts/axe-audit.mjs` (Playwright Chromium + `@axe-core/playwright`).
- Scope: Home, History, Settings, Results, Login, Privacy — light and dark themes (12 combos).
- **Result: 0 violations in all 12 combos** after the contrast fixes below.
- Raw JSON per page/theme: `axe-<page>-<theme>.json`; human summary: `axe-summary.md`.

### Fixed (all `color-contrast`, serious)
- Light theme muted text `#737373` → `#595959` (was ~4.0:1, now ~7:1 on surfaces).
- Dark theme action blue `#3B82F6` → `#1F6FEB` so white button text reaches 4.6:1.
- New `--color-action-text` token for text/icons on colored surfaces
  (`#2563EB` light / `#8FB6FF` dark) instead of reusing the button background color.
- Danger red text now uses the risk palette (`--color-risk-high-text`) instead of `red-500`.
- Removed a low-opacity uppercase label in Results.

## Lighthouse (desktop, production-like build via `vite preview` semantics)

Desktop scores (dev server; treat performance as indicative, not absolute):

| Page | Perf | A11y | Best practices | SEO |
|---|---|---|---|---|
| Home (`/` → login when logged out) | 65 | 98 | 96 | 91 |
| Login | 90 | 98 | 96 | 91 |
| Privacy | 90 | 96 | 96 | 91 |

JSON reports: `lighthouse-<page>-desktop.json`.

Notes:
- The single remaining a11y deduction is `landmark-one-main` (moderate in
  axe-core 4.14, **not** serious/critical). It does not reproduce outside the
  Lighthouse harness: direct axe runs report 0 violations, and DOM dumps show
  exactly one `<main>` (plus a static loading `<main>` in `index.html` so the
  landmark exists pre-hydration). No app change is warranted beyond the shell
  landmark already added.
- Mobile form-factor runs are blocked by this lab environment (Chromium shows
  an interstitial page under mobile emulation here, unrelated to the app).
  Mobile is covered by the responsive layout, axe runs, and the Playwright e2e
  suite instead.
- Performance on Home is measured against the login redirect on a dev server
  (no minification, no preview build); re-measure on the production build
  before treating the numbers as budgets.
