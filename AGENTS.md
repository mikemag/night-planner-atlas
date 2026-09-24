# Night Planner Atlas agent guidance

Night Planner Atlas is a static website for planning dark-sky nights. For any site it shows
twilight, moonlight and moon-free true dark night by night, across months and years, in several
views. It is Mike's project, developed with agents. It is private for now and will become public.

## Orientation

- `site/` is the deployable site, with no build step yet. `site/scripts/atlas.js` is the whole app:
  one IIFE, sectioned by comments. `site/styles/atlas.css` holds the styles and theme tokens, and
  `site/vendor/` holds pinned third-party code.
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

- `scripts/serve.sh` serves `site/` at <http://localhost:8000/>.
- Look at what you changed in both light and dark themes. Check desktop size (about 1500×900) and
  phone width (about 390 px, with no horizontal page scroll). A syntax check such as
  `node --check site/scripts/atlas.js` is not a UI check.
- The app exposes `window.__npa` (state and actions) and dispatches `npa-ready` on `window` once
  nights are computed; use them to drive views in tests. Settings persist in localStorage under
  `npa:` keys.
- Headless Chrome gives full-resolution screenshots without the browser pane:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new
  --screenshot=out.png --window-size=1512,920 --virtual-time-budget=6000 <url>`. It writes the
  file and then hangs, so poll for the file and kill the process. It can't render narrower than
  about 500 px.
- When the night model changes, spot-check a few nights against a reference such as USNO or NOAA
  sun and twilight tables, and say what you checked.

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
  contrast (use `inkOn`), and the Table view carries the same numbers as the charts.

## Dependencies and credits

- Prefer permissive licenses such as MIT, BSD and Apache-2.0. Copyleft or unknown licenses need
  Mike's approval.
- Credit third-party code in `THIRD_PARTY_NOTICES.md` and in the site's visible credits. Keep
  upstream license files next to vendored code.

## Git and GitHub

- The default branch is `main`, and the repository is `mikemag/night-planner-atlas` (private).
- Make small, reviewable commits whose messages say why. Don't push, force-push or change
  repository settings unless asked.
- Comment on issues for material decisions, blockers and results, not routine progress.
