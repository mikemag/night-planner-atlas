# Night Planner Atlas

Plan dark-sky nights by the month and the year. For any site, Night Planner Atlas shows each
night's twilight stages, when the moon is up, and how much **moon-free true dark** there is. The
layout shows how that shape shifts across weeks, lunar cycles and seasons, so you can pick the
nights worth the drive to a dark site.

![River view: one row per night, clock time across](docs/images/river-month.png)

It began as a design study for the night planner in AllSky's Timeline and grew into its own site.
It is a private prototype for now; [issues](https://github.com/mikemag/night-planner-atlas/issues)
track where it is going.

## The views

- **River** (default): one row per night, clock time across. The moon's nightly 50-minute
  march becomes diagonal stripes, the seasons an hourglass, and clock changes a visible step.
  Zoom by row height: Year, Month, Week.
- **Calendar**: a month grid where each day holds that evening's night, and a Year view of mini
  months with monthly totals. Expand any week for times.
- **Lunations**: one row per lunar cycle, aligned on new moon, with the best Friday–Saturday of
  each cycle.
- **Table**: the same numbers, one month at a time.

All views share one visual language and the same controls: new-moon focus (±N nights), when the
moon counts as up, and whether to ignore a thin crescent. Click any night for its altitude chart
and stage times; the side panel also lists the darkest weekends ahead.

| Year at a glance (River) | Calendar | Lunations |
| --- | --- | --- |
| ![River, Year zoom](docs/images/river-year.png) | ![Calendar, month](docs/images/calendar-month.png) | ![Lunations, ±5 nights](docs/images/lunations.png) |

- [docs/design.md](docs/design.md): the views, the shared visual language, and the reasoning
  behind them.
- [docs/night-model.md](docs/night-model.md): exactly how each night is computed.

## Running it

The site is plain HTML, CSS and JavaScript with no build step:

```bash
scripts/serve.sh
```

That serves `site/` at <http://localhost:8000/> (pass a port to change it). Any static file server
works. Sun and moon positions are computed in the browser; your site is saved only in the
browser's local storage and never sent anywhere.

## Layout

```text
site/                   the deployable static site
  index.html
  styles/atlas.css      theme tokens, layout, components
  scripts/atlas.js      the whole app, for now
  vendor/               pinned third-party code (Astronomy Engine)
docs/                   design notes, night model, screenshots
scripts/serve.sh        local server
AGENTS.md               guidance for coding agents working in this repo
```

## Status

A working prototype. Work is tracked in GitHub issues. First up: a build toolchain with tests,
checking the numbers against reference tables, and hosting on Google Cloud. After that come the
features: shareable links, choosing the metrics each view shows, and accounts to save sites and
preferences.

## Credits

Sun and moon positions come from [Astronomy Engine](https://github.com/cosinekitty/astronomy) by
Don Cross (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Not yet licensed: all rights reserved while the project is private.
