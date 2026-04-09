# Repository Guidelines

## TL;DR
NeoLine is an Angular + browser-extension wallet for Neo2, Neo3, and NeoX (EVM). Treat this file as the default contract for contributors and coding agents: follow repo structure, run lint/tests, and keep changes minimal and scoped.

## Non-Negotiable Rules
- Do not commit build artifacts or local outputs: `dist/`, `coverage/`, `web-ext-artifacts/`.
- Keep PRs focused on one logical change; avoid unrelated refactors.
- Run `npm run lint` and `npm run test:ci` before opening a PR.
- Respect existing architecture boundaries (`src/` Angular UI vs `extension/` runtime scripts).
- When changing shared dAPI models, constants, or error shapes, update `cross-runtime/` first and keep popup/extension consumers aligned.
- Preserve chain compatibility for `Neo2`, `Neo3`, `NeoX`; do not remove legacy neon aliases unless explicitly planned.

## Quick Start & Commands
- `nvm use`: switch to Node version from `.nvmrc`.
- `npm run installAll`: install dependencies and neon alias packages.
- `npm run start`: local dev server (`localhost:4200`).
- `npm run debug`: dev server + auto-open browser.
- `npm run lint`: Angular ESLint checks.
- `npm test`: Karma/Jasmine in Chrome.
- `npm run test:ci`: headless CI tests (`ChromeHeadless`).
- `npm run scan:dev-audit`: heuristic audit for i18n keys, module-scope constants, and direct storage access.
- `npm run build:chrome` / `npm run build:firefox`: production + extension package build.
- `npm run preview:firefox`: preview built Firefox extension.

Build pipeline:
1. `ng build` outputs app assets to `dist/`.
2. Angular build applies `index-html-transform.js` before packaging.
3. `build:crx:*` uses webpack (`extension/webpack.config.js`) to bundle extension scripts and merge manifest JSON.

Environment baseline: Node `>=16.20.1`, npm `~8.19.4`.

## Repository Map
- `src/`: Angular app.
- `src/app/popup/`: main wallet flows and dialogs.
- `src/app/popup/_lib/`: popup-side shared domain helpers, dAPI types, chain helpers, and error utilities.
- `src/app/core/`: services, guards, startup, state utilities.
- `src/app/share/`: shared components/pipes/directives.
- `src/app/ledger/`: Ledger hardware-wallet flow.
- `src/app/reduers/`: NgRx reducers/state slices.
- `cross-runtime/`: shared Neo/EVM dAPI constants, models, and error normalization consumed by both `src/` and `extension/`.
- `extension/`: background scripts, dAPI/injection scripts, manifests.
- `scripts/`: repository maintenance scripts such as `dev-audit.js`.
- `src/_locales/`: i18n JSON (`en`, `zh_CN`, `ja`).
- Tests: colocated `*.spec.ts` files.

## Architecture Notes
- Two runtime targets:
1. Angular popup app (`src/`).
2. Extension runtime scripts (`extension/`).
- Shared runtime contracts live in `cross-runtime/`; `tsconfig.json` exposes `@cross-runtime/*`, and `extension/tsconfig.json` includes that directory in compilation.
- Storage abstraction is centered on `ChromeService`:
1. Extension context: delegates via `ExtensionService`.
2. Local dev context: falls back to `localStorage/sessionStorage`.
- Neo dAPI error normalization is centralized in `cross-runtime/neo-dapi-error.ts`; popup code consumes it via `src/app/popup/_lib/error.ts`, and extension background code imports it directly.
- Manifest composition: `extension/manifest/base.json` + platform file (`chrome.json` or `firefox.json`).
- Path aliases (from `tsconfig.json`): `@/*`, `@styles/*`, `@assets/*`, `@images/*`, `@fonts/*`, `@app/*`, `@models/*`, `@share/*`, `@popup/*`, `@cross-runtime/*`.

## Style & Naming
- Follow `.editorconfig`: UTF-8, 2 spaces, final newline.
- TypeScript strings use single quotes.
- Angular selector lint rules:
1. Components: element selectors in `kebab-case`.
2. Directives: attribute selectors in `camelCase`.
- Keep feature files grouped by module and avoid cross-module coupling.

## Commit & PR Expectations
- Preferred commit prefixes: `feat:`, `fix:`, plus release commit style `version x.y.z`.
- PR should include:
1. What changed and why.
2. Linked issue/task (if any).
3. UI screenshots/recording for visual changes.
4. Validation notes (`lint`, `test:ci`, and build result when relevant).

## Agent Working Notes
- Prefer minimal diffs and local consistency over broad rewrites.
- Update tests when behavior changes.
- If uncertain about chain-specific behavior, inspect `src/app/core/services/{neo,evm}`, `cross-runtime/`, and `extension/common` before editing.
