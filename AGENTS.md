# Night Planner Atlas agent guidance

Night Planner Atlas is a static website for planning dark-sky nights. For any site it shows
twilight, moonlight and moon-free true dark night by night, across months and years, in several
views. It is Mike's project, developed with agents. It is private for now and will become public.

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

- Use Node 24.11 from `.node-version`. `npm run dev` serves the site at <http://localhost:5173/>.
- `npm run check` runs lint, the format check, the type check, the unit tests and the build. Run
  it before every commit. Tests run locally; there is no GitHub CI workflow.
- The unit tests pin the night model two ways. Golden files in `src/model/testdata/`, first
  captured from the original prototype, must match exactly. Sun events must also agree with an
  independent solar model to within 30 s. After an intentional change to the model, regenerate the
  golden files with `npx vitest run -u` and explain the diff in the commit.
- `npm run test:e2e` runs the Playwright smoke tests against the production build in Chromium
  (light and dark) and WebKit. `npm run screenshots` also saves every view to
  `test-results/screenshots/`, which is the quickest way to look at a change at full resolution.
- Look at what you changed in both light and dark themes. Check desktop size (about 1500×900) and
  phone width (about 390 px, with no horizontal page scroll). Type checks and unit tests are not
  UI checks.
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

- Prefer permissive licenses such as MIT, BSD and Apache-2.0. Copyleft or unknown licenses need
  Mike's approval.
- Credit third-party code that ships in the site in `THIRD_PARTY_NOTICES.md` and in the site's
  visible credits, and keep its license header in the bundle (`vite.config.ts` preserves legal
  comments). Check licenses of new dependencies, including transitive ones, before adding them.

## Git and GitHub

- The default branch is `main`, and the repository is `mikemag/night-planner-atlas` (private).
- Make small, reviewable commits whose messages say why. Don't push, force-push or change
  repository settings unless asked.
- Comment on issues for material decisions, blockers and results, not routine progress.
