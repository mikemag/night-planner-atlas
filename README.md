# Night Planner Atlas

Plan dark-sky nights by the month and the year. For any site, Night Planner Atlas shows each
night's twilight stages, when the moon is up, and how much **moon-free true dark** there is. The
layout shows how that shape shifts across weeks, lunar cycles and seasons, so you can pick the
nights worth the drive to a dark site.

![River view: one row per night, clock time across](docs/images/river-month.png)

It is a private prototype for now; [issues](https://github.com/mikemag/night-planner-atlas/issues)
track where it is going.

## The views

- **River** (default): one row per night, clock time across. The moon's nightly 50-minute
  march becomes diagonal stripes, the seasons an hourglass, and clock changes a visible step.
  Use Year for an overview, Month for nightly windows, and expand individual Month nights for boundary times.
- **Calendar**: a month grid where each day holds that evening's night, and a Year view of mini
  months with monthly totals and direct month navigation. Select a night to open its horizontal
  timeline beneath the week; dim neighboring dates complete the weeks.
- **Lunations**: one row per lunar cycle, aligned on new moon, with the best Friday–Saturday of
  each cycle. Full cycle shows every night exactly once, assigned to its nearest new moon, with
  padding keeping new moon centered. Taller night columns run from evening down to morning, with usable-hour bars below;
  select a night for its horizontal timeline. Phones start at ±3 nights, with wider windows available.

All views share one visual language and the same controls: new-moon focus (±N nights), when the
moon counts as up, and whether to ignore a thin crescent. Expand a night in any view for the same ordered boundary times and separate usable windows.
River and Calendar keep the darkest weekends in a collapsible tray. **How it works** explains the calculations, measured accuracy, conventions,
controls, privacy and credits, with technical detail available on demand.

| Year at a glance (River)                        | Calendar                                           | Lunations                                           |
| ----------------------------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| ![River, Year zoom](docs/images/river-year.png) | ![Calendar, month](docs/images/calendar-month.png) | ![Lunations, Full cycle](docs/images/lunations.png) |

- [docs/design.md](docs/design.md): the views, the shared visual language, and the reasoning
  behind them.
- [docs/night-model.md](docs/night-model.md): exactly how each night is computed.

## Running it

You need Node 24.11 (see `.node-version`; `fnm` or `nvm` will pick it up) and npm.

```bash
npm install
npm run dev
```

`npm run dev` serves the site at <http://localhost:5173/> with hot reload. `npm run build` writes
the deployable static site to `dist/`, and `npm run preview` serves that build. Sun and moon
positions and site time zones are computed in the browser. Saved sites stay in browser storage;
sharing a site requires explicitly including it in a copied link. Named local favorites keep complete site records. Paste coordinates or a supported full Google
Maps search link; a bundled offline lookup infers the editable IANA zone. The header shows the
site’s current local clock, UTC offset and zone. System, Light, Dark and Observing themes are saved
locally; Observing is designed for a separately enabled OS red filter.

You can enter an optional elevation above sea level; blank uses sea level.
Elevation adjusts the observer position and idealized refraction, with a level horizon and no
automatic terrain lookup.

See [Hosting the Helen preview](docs/hosting.md) for local deployment, caching, rollback and
per-browser settings behavior. Deployment publishes only the built site; the repository stays
private.

| Command               | What it does                                                                      |
| --------------------- | --------------------------------------------------------------------------------- |
| `npm run check`       | Lint, format check, type check, unit tests and build                              |
| `npm run deploy`      | Run local checks and browser tests, then publish to Firebase Hosting              |
| `npm test`            | Unit tests for the night model (Vitest)                                           |
| `npm run test:e2e`    | Browser smoke tests of the built site in Chromium and WebKit (Playwright)         |
| `npm run screenshots` | The smoke tests, saving a screenshot of every view to `test-results/screenshots/` |
| `npm run format`      | Format everything with Prettier                                                   |

The first time you run the browser tests, install their browsers with
`npx playwright install chromium webkit`. All checks run locally; GitHub does not run tests on
pushes or pull requests. Browser tests build and start their own preview server on port 4174 and
fail if that port is already occupied, so they cannot accidentally test a different server.

## Layout

```text
index.html              the page (Vite entry)
src/
  model/                the night model: time zones, nights, ranges, formatting (no DOM)
  app/                  settings, shared state, and the shell that ties views together
  views/                River, Calendar and Lunations
  render/               canvas surface, theme colors, drawing one night
  ui/                   shared night details, readout, controls
  styles/atlas.css      theme tokens, layout, components
public/                 files served as-is (favicon)
e2e/                    browser smoke tests
docs/                   design notes, night model, screenshots
AGENTS.md               guidance for coding agents working in this repo
```

## Status

A working prototype with TypeScript, Vite, and local unit and browser tests.
Work is tracked in GitHub issues. The night model has been checked
against USNO tables; see the measured accuracy and sampling limits in
[the night model](docs/night-model.md#reference-verification-and-accuracy). Next up is polishing
the River, Calendar and Lunations views and assessing usability in the
[hosted preview](https://night-planner-atlas.web.app/). Public launch remains separate work.

## Credits

Sun and moon positions come from [Astronomy Engine](https://github.com/cosinekitty/astronomy) by
Don Cross (MIT). Offline time-zone lookup uses tzf-wasm (MIT), with boundary data from
OpenStreetMap contributors via timezone-boundary-builder and tzf-dist (ODbL 1.0). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Not yet licensed: all rights reserved while the project is private.
