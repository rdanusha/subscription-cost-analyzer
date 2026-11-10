# Subscription Cost Analyzer

Created: 2026-11-09. Built by **rdanusha**.

A free browser-only calculator for recurring subscription spending and hypothetical cancellation savings. This is a separate public-release app inspired by the local Subscription Intel dashboard. The original app and its data are not imported, overwritten, or deleted.

## Publication

Publication to the public repository `rdanusha/subscription-cost-analyzer`, GitHub Pages hosting, and the included MIT license is approved. Deployment status is verified separately from local tests.

- Public repository: https://github.com/rdanusha/subscription-cost-analyzer
- App URL: https://rdanusha.github.io/subscription-cost-analyzer/

The release includes Full Tour as the only fictional example set, Cards and compact List views, and proportional color-matched category bars. Nothing is posted to Facebook automatically.

## Features

- Add, edit, remove, sort, and review subscriptions with monthly, quarterly, or annual billing.
- Monthly averages and yearly projections, calculated from per-period prices.
- Mark items you are considering cancelling and see potential annual savings and remaining monthly spending.
- A colorful category donut and current-versus-plan spending bars, calculated from the same full-precision annual totals as the summary. Filters do not change the full-list graphs or summary totals.
- Subscription Intel's near-black `#0d0f17` background, blue/purple accents, colorful category icons, and matching cards. Colors are paired with text labels, and the donut has a descriptive accessible name.
- One currency per list: USD, EUR, GBP, CAD, AUD, INR, LKR, or JPY. No exchange-rate service or conversion.
- Automatic browser-local saving of your own list when storage is available.
- Explicit Delete my data control with confirmation, scoped only to this app's storage key.
- Separate fictional example mode that never persists its edits or replaces your saved list.
- Storage corruption, blocked/quota-limited storage, and cross-tab conflicts are surfaced instead of silently discarding saved information.
- Direct title, mobile-friendly controls, keyboard navigation, labeled fields, and safe DOM text rendering.

## Categories

The 13 presets are Entertainment, Productivity, Health & Fitness, Utilities, Learning, Streaming, Software & Dev Tools, Finance, Business, News & Media, Gaming, Storage & Cloud, and Other. Each has a matching icon and chart color.

Existing saved categories remain supported. Health & Fitness is a display-only label for the existing `Health` value, including on subscription cards, the dropdown, legend, and accessible chart description. No saved-list rewrite or schema migration is performed on load.

## Open locally

Open `index.html` in a modern browser. For more consistent browser-storage behavior, serve this folder on a fixed local origin:

```sh
python3 -m http.server 4182 --bind 127.0.0.1
```

Then visit http://127.0.0.1:4182 . This address is local to the Mac, not a public sharing link. Browser storage is scoped to the site/origin. Lists entered using a local file, localhost, and a future hosted site are not automatically transferred.

## Calculation model

All entries in a list use the same currency. The currency selector is disabled while entries exist, preventing existing prices from being silently relabelled. Empty the list to choose another currency.

- Monthly billing: price × 12 per year.
- Quarterly billing: price × 4 per year.
- Annual billing: price × 1 per year.
- Monthly average: yearly cost ÷ 12.
- Potential savings: yearly costs of the entries the user marks for consideration.
- Monthly after plan: remaining yearly cost ÷ 12.

Prices are parsed as decimal strings into integer minor units. Aggregate yearly costs are calculated before rounding, then formatted at the selected currency's precision. JPY accepts whole amounts; other supported currencies accept up to two decimal places. Rounded row averages may not sum exactly to rounded totals. Free subscriptions are valid; missing or invalid prices are not treated as zero.

Limits: up to 500 subscriptions; each entered price from zero through 1,000,000 per billing period. Use a dot for decimals, without grouping commas or exponent notation.

Projections assume unchanged recurring prices for a full year. They are not a cash-flow calendar or an immediate refund estimate. Taxes not included in the entered price, prepaid periods, cancellation fees, notice periods, refunds, changing prices, partial-year timing, inflation, and exchange rates are not modelled. This app does not connect to providers, cancel services, import bank transactions, send renewal reminders, or provide financial advice.

## Privacy and browser storage

The runtime has no remote dependencies, analytics, API calls, account system, or server upload of subscription entries. Hosting providers still receive normal page/asset requests and may log connection information. Source/profile links open GitHub only when clicked.

Your own list is stored unencrypted in browser local storage under `rdanusha.subscription-cost-analyzer.v1`. Anyone using the same browser profile may access it, and same-origin scripts can access that storage. Do not enter passwords, account numbers, or payment details. Browser cleanup or private mode may remove saved information; this is not a backup service or cross-device sync.

The original Subscription Intel key `si_subs` and all other site keys are left untouched. Delete my data atomically replaces this app's saved record with an empty list and default settings, then clears the in-memory list. Only a fresh anonymous deletion revision remains with the empty defaults, so queued older tabs can detect the reset even if no list had been saved before. No subscription names, prices, or previous currency are retained in that reset record. This does not cancel real subscriptions. A reset-write failure is explicitly reported and never described as successful deletion.

Corrupt/unsupported saved state is preserved and editing blocked until explicit reset. Saves and deletion share an origin-scoped exclusive Web Lock, with a fresh storage read under the lock. Pending writes disable conflicting same-tab mutations and mode switches. A changed baseline is rejected instead of overwriting another tab's accepted update. Another tab changing the key locks this tab against stale writes; reload to use the current saved list.

Web Locks require a supported browser and a secure context, normally HTTPS or localhost. If locks are missing or cannot be acquired safely, persistent editing is read-only, saved raw data is preserved, and deletion is not confirmed. Use browser site settings to clear saved information if app deletion cannot run. Fictional examples remain editable without saving. Storage-read/write failures with working locks can still allow explicitly unsaved in-tab calculations. Example mode is separate and does not change your saved data unless you explicitly choose Delete my data.

## Development and tests

Node.js 22+ and Python 3 are used for development only. App users need no install or build.

```sh
npm ci --ignore-scripts
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

By default, stop any local server on port 4182 before running the browser suite; it starts its own test server. To intentionally test this project's already-running preview, use `SCA_TEST_REUSE_SERVER=1 npm run test:e2e`. For WebKit, install it with `npx playwright install webkit` and run `SCA_TEST_BROWSER=webkit npm run test:e2e` (combine with the reuse flag if needed). Test contexts use controlled fixtures and do not read a personal browser profile. Screenshots are generated only from fictional examples.

## Files

- `index.html`, `styles.css`, `app.js`: interface and browser-local data lifecycle.
- `model.js`: pure validation, monetary normalization, totals, and storage schema.
- `tests/model.test.js`: unit tests.
- `tests/browser/app.spec.js`: real-browser interaction, privacy, storage, and responsive tests.
- `tests/browser/visual.spec.js`: graph arithmetic, original-palette matching, empty/free and tiny-cost behavior, JPY precision, storage preservation, and graph overflow tests.
- `social-preview.png`: real-UI social image generated from fictional examples by the browser suite.
- `release/`: Facebook draft, verification notes, and local screenshots.
- `.github/workflows/pages.yml`: verified-tests-first Pages deployment, immutable action references, superseded-revision guard, and a six-file public asset allowlist.

A visible pre-redesign source backup is under `release/before-redesign-*`, ignored by Git and excluded from public deployment. Reference screenshots are also local-only. The sharing image is captured from the real interface with temporary compact screenshot-only styling, using clearly labelled fictional examples.

## Publication checklist

Approve repository name, public visibility, MIT license, and Pages hosting before publication. Verify the deployed revision, signed-out desktop/mobile behavior, public assets, and rdanusha credit before calling the app live. Check Facebook's actual link preview separately; local Open Graph validation is not Facebook cache verification. Facebook posting requires separate authorization.

MIT license. Feedback is welcome; do not put personal subscription details in public issues.
