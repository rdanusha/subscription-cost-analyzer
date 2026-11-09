# Local verification

## Executed checks

- `npm run check`: passed syntax checks for `model.js` and `app.js`.
- `npm test`: 18 unit tests passed, zero failures.
- `SCA_TEST_REUSE_SERVER=1 npm run test:e2e`: 48 Chromium browser tests passed against the running project preview, zero failures.
- `SCA_TEST_REUSE_SERVER=1 SCA_TEST_BROWSER=webkit npm run test:e2e`: all 48 browser tests also passed in WebKit, including category coverage, graph tests and deterministic save/save and save/delete overlap regressions.
- `npm audit`: zero known vulnerabilities in the installed dependency set.
- `git diff --cached --check`: passed.
- Added-source static checks found no credential assignments, private keys, known token patterns, unsafe evaluation/shell execution, private local user paths, work email, or `innerHTML` assignments.
- Browser checks include mixed billing cycles, hypothetical savings, free prices, invalid prices, JPY precision, currency locking, reload persistence, edit/remove flows, literal HTML-shaped names, isolated demo mode, scoped deletion, corrupt state, blocked reads/writes/deletion, and stale writes across tabs or after a missed storage event.
- Responsive checks passed at 320, 390, 768, and 1440 CSS pixels. Form fields have associated labels or explicit accessible names. Browser tests observed no uncaught page errors, failed asset requests, or HTTP requests outside the local app origin.
- Additional 808 deterministic currency/list scenarios passed annual-cost conservation, category-total conservation, and storage roundtrips.
- Additional Chromium and WebKit mobile-width smoke checks passed LKR annual-to-monthly costs, saving/reloading, planned savings, deletion, and direct-file example calculations. No page errors were observed. This is not a physical iPhone/Safari device test.
- Keyboard note: Chromium's Tab reached the skip link. WebKit on this Mac used its default form-control-only Tab behavior; Option+Tab reached the skip link, and keyboard activation worked. This was a browser navigation preference, not an app runtime error.
- Local preview returned HTTP 200 at `http://127.0.0.1:4182/`. This is Mac-local only, not a public address.
- Desktop/mobile screenshots and the 1200 × 630 sharing image were generated from the actual UI using fictional examples and visually inspected. No real subscription data was used.
- Workflow YAML parsed; official action versions resolve to the pinned immutable commit SHAs. Deployment is gated behind tests and the current main-branch revision, with an explicit six-file public asset allowlist.

## Original preserved

The approved category expansion adds Streaming, Software & Dev Tools, Finance, Business, News & Media, Gaming, and Storage & Cloud while preserving all legacy category keys. There are now 13 presets with matching card icons, distinct chart colors and consistent donut swatches. `Health` is still the stored value; `Health & Fitness` is its display label. New unit/browser tests verified all categories save and reload, legacy saved bytes are unchanged on load, editing legacy Health retains its stored value, totals conserve correctly, and all-category graphs fit mobile/desktop widths. Category screenshots were visually inspected. The category whitelist is extended, but monetary formulas are unchanged.

The visual redesign uses Subscription Intel's exact `#0d0f17` background and a blue/purple/green/amber card palette with colorful category icons. New category-donut and plan-comparison graphs use unrounded annual totals for proportions. Browser tests cover empty/free data, tiny annual amounts, JPY, edits/removal, and saved-data preservation. A source comparison at the visual-only redesign stage confirmed the monetary model, exclusive-lock persistence, and deletion handler matched the visible `release/before-redesign-*` backup. The later deletion-invalidation fix is a separate storage change, documented below; the monetary model is unchanged. Additional Chromium/WebKit smoke checks verified the header Add action focuses the real form and graphs update after a coordinated save.

Both supplied reference apps remain unchanged. Subscription Graveyard's verified SHA-256 is `9573e88ee3bc6ef80636714c730ddd2cd456013edbc3d0d7711539bf67771a75`. Reference screenshots and pre-redesign backups are ignored by Git and excluded from the Pages asset allowlist. Desktop/mobile screenshots and the compact sharing image were regenerated and visually inspected after redesign.

The original `subscription-intel/index.html` checksum before and after this build is identical:

```text
SHA-256 1c4bdd184b237c558ce2c5311c8e93692aea10f8a88d0bb9fadaf5859f30c50a
```

The new app uses its own storage key and browser tests confirm it neither imports nor deletes the original app's `si_subs` key. All implementation files are in a separate `subscription-cost-analyzer` folder.

## Remaining gates

- Independent visual, category, and targeted storage reviews passed with no blocking security or logic findings. The initial competing-save race is fixed by exclusive Web Locks. The absent-baseline deletion race is fixed by an atomic empty/default reset with a fresh cryptographic deletion revision. Parent verification passed both complete 48-test browser suites, including first-ever, quota-unsaved and previous-reset baselines in both queue orders, rejected locks and missing/throwing UUID generation. Approval concerns the reported deletion-invalidation contracts, not universal ABA protection. A nonblocking review suggestion is additional category-change edit/reload coverage for every newly added category; current browser tests cover creating/reloading all categories and editing legacy Health.
- Public repository creation, MIT-license approval, and Pages publication are pending Alex's approval.
- No public hosted workflow or live app has been verified for this project.
- Facebook platform link-preview verification and publishing are not performed.

Passing local checks does not mean the app is published. The social copy remains a draft with proposed URLs.
