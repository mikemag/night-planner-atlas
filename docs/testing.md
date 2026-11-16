# Testing Atlas

All checks run locally; GitHub does not run tests on pushes or pull requests. Use Node 24.11
from `.node-version` and install dependencies with `npm ci`. Before the first browser run, install
the two engines:

```bash
npx playwright install chromium webkit
```

Browser tests build and start their own production preview on port 4174. They fail if that port
is occupied, so they cannot accidentally test a different server. The command reference is in
the [README](../README.md#running-it); [AGENTS.md](../AGENTS.md#checking-changes) sets the rules for
checking changes.

## Choosing checks

Run `npm run check` before every commit. It includes lint, formatting, regular unit tests and
the production build with its type check. Add browser checks appropriate to the change:

| Change                                                         | Additional checks                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Local UI                                                       | Affected files, e.g. `npm run test:e2e:ui -- e2e/calendar.spec.ts` |
| Shared styling, themes or rendering                            | `npm run test:e2e:ui`                                              |
| State, saved data, sharing, offline, loading, cache or workers | `npm run test:e2e:integration` and affected UI files               |
| Night model, time calculations or astronomy dependency         | `npm run test:audit` and `npm run test:e2e`                        |
| Release                                                        | `npm run check:full`                                               |

`npm run test:e2e:smoke` is a small cold-start check of views, selection and site switching.
It supplements the relevant specs. `npm run check:full` combines the regular checks, exhaustive
audits and all browser tests; `npm run deploy` runs that gate before publishing.

Regular unit tests retain golden records, independent numerical references and focused edge
cases. The separate audits retain the full-year lunar sampling and polar solar sweeps.
`npm run test:all` runs both unit suites. See the [night model](night-model.md) for the numerical
contract and reference checks.

## Browser and theme coverage

Every scenario runs in Chromium and WebKit with a light initial system preference. The extra
`chromium-dark` project selects only cases tagged `@dark`. Project names describe the initial
system preference: tests that switch through Light, Dark and Observing exercise all three
palettes in each engine without a duplicate dark Chromium run.

The additional dark cases cover:

- Initial system-theme selection and valid colors when the stylesheet loads late.
- Calendar duration-bar pixels and selection outlines, and New Moon label contrast against
  actual canvas pixels.
- Forced-color checkmarks and chart focus under a dark system preference.
- Curated view, Calendar-period and expanded-night captures at desktop and phone widths that
  do not already cycle through themes.

Theme-cycle tests retain preference persistence, state preservation, contrast and responsive
layout assertions. Their System checks explicitly exercise both light and dark OS preferences.
General navigation, calculation, storage and privacy cases run once per engine. When adding a
test, use `@dark` only if the initial dark preference adds a meaningful assertion or one of the
curated captures; avoid tagging a case that already cycles through the palettes it checks.

The suite selections are in [`e2e/suites.ts`](../e2e/suites.ts), the tags are beside the tests,
and the projects are in [`playwright.config.ts`](../playwright.config.ts). Inspect the matrix
without launching browsers:

```bash
npm run test:e2e -- --list
npm run test:e2e -- --project=chromium-dark --list
```

File selection and command-line filters (such as `--grep @smoke` or `--grep @retina`) further
narrow the tagged dark cases; they do not restore the full dark matrix. The suite does not
compare whole-page screenshots against baselines; visual inspection remains necessary.

UI tests use isolated browser contexts populated with real astronomy data generated once per
run from the current production build, separately for each engine. No saved sites or preferences
are shared. Cold-start, loading, cache, offline and privacy tests still calculate from scratch.
Tests of those behaviors use ordinary Playwright `test` or `coldTest`, not the prepared `ui-test`
fixture. `e2e/ui-fixture.spec.ts` checks exact equality between prepared and cold calculations.

## Screenshots

`npm run screenshots` captures the curated `@retina` cases headlessly at ordinary density.
To capture a particular file's visual cases, use:

```bash
SCREENSHOTS=1 npx playwright test e2e/calendar.spec.ts
```

Images go to `test-results/screenshots/`. Inspect the relevant images in light and dark themes,
at desktop size (about 1500×900) and phone width (about 390 px, without horizontal page scroll).
Generating captures alone is not a visual review.

Functional WebKit tests use standard pixel density: headless Retina WebKit on macOS can throttle
startup timers enough to trip otherwise healthy readiness checks. `npm run screenshots:retina`
uses one visible WebKit window at 2× density for the same desktop/phone views, expanded nights
and themes. This optional check requires an active desktop session; use headless suites for an
unattended or locked laptop.

`npm run screenshots:readme` uses a separate Chromium session and production preview on port 4175.
It fixes the clock to September 6, 2026 at 6 PM in Seattle, loads calendar year 2026 at the public
Seattle starter site, and sets strict Moon thresholds. The capture choices are in
[`scripts/capture-readme.mjs`](../scripts/capture-readme.mjs). Review the generated PNGs before
copying them to `docs/images/`; the command does not overwrite the published README images or
run the full browser suite.

## Debugging and measuring

Both runners default to two workers to bound laptop load. Failure screenshots are automatic.
To diagnose a specific failure, enable tracing on a focused rerun:

```bash
npm run test:e2e -- e2e/calendar.spec.ts --grep "test name" --trace=retain-on-failure
```

Tracing is otherwise off because it records every passing test before discarding the trace.
Worker counts can be overridden with `--workers=4` (Playwright) or `--maxWorkers=4` (Vitest).
After relevant checks pass, repeat or broaden them only for a new change, failure or unresolved
concern.

On macOS, measure a run with:

```bash
/usr/bin/time -p npm run test:e2e:ui -- e2e/calendar.spec.ts
```

`real` is elapsed time; `user` plus `sys` is CPU time across cores. Browser timings include the
build and setup. Avoid running timed suites concurrently.
