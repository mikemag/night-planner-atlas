# Night Planner Atlas agent guidance

Night Planner Atlas is a static website for planning dark-sky nights. For any site it shows
twilight, astronomical darkness, moonlight and usable dark night by night, across months and
years, in several views. It is Mike's project, developed with agents, hosted at
<https://night-planner-atlas.web.app/>. The existing public GitHub repository provides the AGPL
source and build instructions.

## Orientation

- `index.html` and `src/` are the site: TypeScript built with Vite into static files in `dist/`.
  `src/model/` is the night model and has no DOM; `src/app/` holds settings, shared state and the
  shell; `src/views/` the River, Calendar and Lunations views; `src/render/` the canvas and
  theme colors; `src/ui/` the inspector, tooltip and controls. `src/styles/atlas.css` holds the
  styles and theme tokens.
- `docs/design.md` describes the views, their shared visual language and the reasoning behind
  them.
- `docs/night-model.md` defines how a night is computed. Treat it as the contract, and update it
  in the same change as the code.
- GitHub issues own remaining work, priorities and ideas. Don't check in plans, progress logs or
  TODO lists; keep docs about current behavior and rationale.

## Working style

- For an implementation request, make routine design choices yourself and briefly explain the
  consequential ones. Pause for product changes, privacy questions, or anything that could lose a
  user's saved data.
- Prefer the simplest coherent solution. A toolchain, framework or backend arrives when an issue
  calls for it, not speculatively.
- Keep changes scoped. Keep the visual language consistent across every view: change a color,
  symbol or threshold everywhere at once, along with the legend and `docs/design.md`.

## Checking changes

- See [Testing Atlas](docs/testing.md) for setup, suite details, screenshots and debugging.
- Use Node 24.11 from `.node-version`. `npm run dev` serves the site at <http://localhost:5173/>.
- `npm run check` runs lint, the format check, the regular unit tests and the production build
  (which includes the type check). Run it before every commit. Tests run locally; there is no
  GitHub CI workflow. `npm run check:full` adds the exhaustive model audits and all browser tests;
  deployment runs this full gate.
- Scope browser verification to the change. For a local UI change, run the affected spec files,
  for example `npm run test:e2e:ui -- e2e/calendar.spec.ts`. Selected tests run in Chromium and
  WebKit, with an extra dark Chromium pass only for cases tagged `@dark`. Shared styling, themes
  or rendering changes need the complete `npm run test:e2e:ui` suite. State, saved-data, sharing,
  offline, loading, cache and worker changes need `npm run test:e2e:integration` plus the affected
  UI files. `npm run test:e2e:smoke` is a small
  cold-start check of views, selection and site switching, not a replacement for relevant specs.
- `npm test` keeps the golden records, independent references and focused edge cases in the normal
  development loop. `npm run test:audit` retains the full-year lunar sampling and polar solar
  sweeps. Run the audits and all browser tests when changing the night model, time calculations
  or astronomy dependency, and before releases. `npm run test:all` runs both unit suites.
- The unit tests pin the night model two ways. Golden files in `src/model/testdata/`, first
  captured from the original prototype, must match exactly. Sun events must also agree with an
  independent solar model to within 30 s. After an intentional change to the model, regenerate the
  golden files with `npx vitest run -u` and explain the diff in the commit.
- `npm run test:e2e` runs the full browser regression suite against a fresh production build.
  Visual tests reuse real calculation data prepared from that build once per run; each test still
  has isolated storage and state. Loading, exact cold-start counts, cache, offline and privacy
  integration tests must use the ordinary Playwright `test` (or `coldTest`), not the prepared
  `ui-test` fixture. Keep the warm/cold equality check in `e2e/ui-fixture.spec.ts`. Both browser
  engines retain every scenario. Add `@dark` only when the initial dark system preference adds
  a meaningful assertion or a curated visual capture. Cases that cycle through all themes
  already cover those palettes in both engines; do not repeat them in the dark project. Keep
  both system-preference branches explicit inside theme-switching tests.
- `npm run screenshots` captures the curated view/expansion/theme cases headlessly, not the whole
  regression suite. For a particular file's captures, use e.g.
  `SCREENSHOTS=1 npx playwright test e2e/calendar.spec.ts`. Images go to
  `test-results/screenshots/`. Inspect the relevant images; generating them is not a visual review.
  `npm run screenshots:retina` is an optional visible 2× WebKit run and needs an active desktop;
  do not use it for unattended or locked-laptop checks.
- Look at what you changed in both light and dark themes. Check desktop size (about 1500×900) and
  phone width (about 390 px, with no horizontal page scroll). Type checks and unit tests are not
  UI checks.
- Both runners default to two workers to bound laptop load. Tests save a screenshot on failure;
  use `--trace=retain-on-failure` on a focused browser rerun when a trace is needed. Do not enable
  tracing or run the whole screenshot/browser matrix for every small UI edit. After the relevant
  checks pass, repeat or broaden them only for a new change, failure or unresolved concern.
- The app exposes `window.__npa` (state and actions) and dispatches `npa-ready` on `window` once
  nights are computed; tests use them, plus Playwright's clock to fix "now". Settings persist in
  localStorage under `npa:` keys.
- When the night model changes, also spot-check a few nights against a reference such as USNO or
  NOAA sun and twilight tables, and say what you checked.

## Product rules

- Times are the site's local clock time from its IANA zone, including daylight saving time, never
  the viewer's zone.
- Observing sites can be private. Coordinates stay in the browser (localStorage) and out of URLs,
  logs, analytics and error reports unless a user explicitly shares them.
- Make no runtime calls to third-party services (CDNs, analytics, APIs) without a decision
  recorded in an issue. The site should keep working offline once loaded.
- Performance is part of correctness. Computing a range must never freeze interaction, and
  layouts must not jump as data arrives.
- Accessibility: every view is reachable by keyboard, labels drawn on sky colors keep their
  contrast (use `inkOn`).

## Dependencies and credits

- The project's code is AGPL-3.0-only, original content is CC BY-SA 4.0, and calculated numerical
  results are CC0 1.0. See README.md for scope and third-party exceptions. Mike approved this
  project licensing choice in #15.
- Prefer permissive licenses such as MIT, BSD and Apache-2.0. Copyleft or unknown licenses need
  Mike's approval.
- Credit third-party code that ships in the site in `THIRD_PARTY_NOTICES.md` and in the site's
  visible credits, and keep its license header in the bundle (`vite.config.ts` preserves legal
  comments). Check licenses of new dependencies, including transitive ones, before adding them.

## Git and GitHub

- The default branch is `main`, and the public source repository is `mikemag/night-planner-atlas`.
- Make small, reviewable commits whose messages say why. Don't push, force-push or change
  repository settings unless asked.
- Comment on issues for material decisions, blockers and results, not routine progress.
