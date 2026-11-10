# Release verification

## Current local checks

- `npm run check`: passed JavaScript syntax checks.
- `npm test`: 18 unit tests passed.
- `SCA_TEST_REUSE_SERVER=1 npm run test:e2e`: 87 Chromium browser tests passed.
- `SCA_TEST_REUSE_SERVER=1 SCA_TEST_BROWSER=webkit npm run test:e2e`: 87 WebKit browser tests passed.
- `npm audit`: zero known vulnerabilities.
- Official GitHub Actions release tags resolve to the immutable SHAs pinned in the Pages workflow.

Coverage includes Full Tour as the only example set, real compact List view and Cards switching, sorting/filtering, keyboard interactions, add/edit/remove, category spending bars, mixed billing, free and tiny prices, JPY precision, browser-local persistence, isolated fictional examples, corrupt/blocked storage, and deterministic cross-tab save/delete coordination. Responsive tests include 320, 390, 768 and 1440 CSS pixels. This is automated Chromium/WebKit coverage, not a physical-device test.

Older example tests were updated from the removed three-entry Starter dataset to independently specified Full Tour totals and category shares. The invalid-number assertion now uses word boundaries so it does not mistake the category name Finance for NaN.

Local backups and generated test artifacts are excluded from Git. GitHub Pages deploys only index.html, styles.css, model.js, app.js, social-preview.png and LICENSE. No saved personal subscription data is part of the release.

## Publication gates

Public repository and GitHub Pages publication are approved. Actual deployment and signed-out live behavior are verified separately after the source push. Facebook posting and Facebook's own preview-cache verification are not included or performed.
