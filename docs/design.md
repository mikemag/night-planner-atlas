# Design

Night Planner Atlas answers one question from several angles: when is it really dark at my site,
and which nights are worth the trip? This document describes the current views, the visual
language they share, and the reasoning behind the choices. Remaining work and ideas live in
GitHub issues.

## What a night is

Each night is labeled by the local date of its evening and runs from local noon to the next local
noon. For every night the site knows the eight sun events (sunset; civil, nautical and
astronomical dusk; astronomical, nautical and civil dawn; sunrise), the moon's altitude through the
night, and its illumination. From those it derives the headline number: **moon-free true dark**,
the part of astronomical darkness when the moon is down. [night-model.md](night-model.md) defines
all of this precisely.

## Visual language

One encoding everywhere, so a night looks the same in every view and in the single-night chart:

- **Sky darkness** is an ordered ramp that darkens monotonically: day, civil twilight (warm, like
  the dusk sky), nautical (blue), astronomical (indigo), true dark (near black). Lightness carries
  the order; hue only helps tell neighbors apart.
- **Moonlight** washes true dark toward a warm grey, stronger the fuller the moon. It is scaled so
  a full moon looks about as bright as late nautical twilight, roughly its real effect on sky
  brightness, while a thin crescent barely lifts the black. The wash is drawn only over true dark,
  where moonlight is what matters.
- **Moon-free true dark** is black with a thin green edge. The edge tells moon-free time apart
  from a thin crescent's nearly black wash. Green is the one "good" color, also used for
  moon-free hour bars and totals.
- **Weekends** (Friday and Saturday nights) get an amber tint, **selection** is an amber outline,
  and **tonight and now** are blue.
- **Time** is the site's local clock time, including daylight saving time. The one-hour jump on a
  clock-change night is real, and the River labels it.
- Both themes are designed. Canvas colors come from the theme tokens in `src/styles/atlas.css`,
  and the sky ramp is tuned per theme so the day band doesn't glare in dark mode. Labels drawn on
  sky colors pick white or ink by the background's luminance.

## The views

### River (default)

One row per night, stacked by date. Clock time runs left to right on a fixed axis from the loaded
range's earliest sunset to its latest sunrise. A row is the single-night chart's phase shading,
flattened.

- **Zoom is row height.** Year fits the whole loaded range on one screen, at about 2 px per night.
  Month uses 20 px rows. Week uses rows tall enough for moon-free window times, sunset, sunrise,
  moonrise and moonset labels, and the moon's altitude track.
- **New-moon focus (±N)** is a fisheye: nights within N of a new moon open up with window times,
  and the rest squash to thin context lines.
- **Gutters.** The left gutter holds date and weekday (weekends tinted and bold) and a moon phase
  glyph. On the right, a bar and value give moon-free hours per night. In Month and Week zoom, a
  minimap of the whole range sits at the right edge; click or drag it to move.
- **Hover** shows a crosshair with the clock time and a tooltip: the night's moon-free total and
  window, sun and moon times, and the sky at the pointer ("True dark · moon up 6°").
- _Best at_ showing the shape: the moon leaving the evening dark after full, the whole night open
  at new moon, the dark sliding to the mornings as the moon waxes. It also shows the seasonal
  hourglass and clock changes.
- _Weak at_ weekday structure, since it is a list and not a grid, and at keeping your place in a
  long scroll. The minimap and Year zoom help with the second.

### Calendar

A month grid, Sunday first. Each day cell holds that evening's night: moon phase and illumination,
the moon-free total, and the window.

- **Time ↓** (default) draws each night as a column with time running down. Cells in a week abut,
  so each week reads as a small river and the moon's slide stays visible across it. **Time →**
  draws a bar with time running across, matching the single-night chart; it is more compact and
  its numbers are easier to read.
- **Month header.** Moon-free total, nights with at least 4 h, new and full moon dates, and a
  sparkline of moon-free hours per night (weekends solid).
- **Expand a week** with the chevron in the left gutter. Time ↓ cells grow and gain window times,
  sunset, sunrise, moonrise and moonset; Time → cells add a short list of facts.
- **New-moon focus** dims nights outside ±N and squashes weeks that contain none.
- **Year** zoom shows mini months with a small night column per day, weekend columns tinted, and
  monthly totals: the calendar app's year view, with data.
- _Best at_ familiarity: weekends are a column, and every cell carries its headline number.
- _Weak at_ continuity: week wrapping breaks the moon's motion every seven days, and a readable
  month fills a screen, so a year means paging rather than scanning.

### Lunations

One row per lunar cycle, aligned so the new-moon night is the center column. Columns count nights
from new moon: ±N with new-moon focus, ±14 otherwise. Each cell is a night column, as in the
Calendar's Time ↓.

- In every row the moon-free window forms a diamond around new moon, so cycles and seasons
  compare straight down the page.
- The row header gives the new moon's date and the moon-free total in the window. The right column
  names the best Friday–Saturday pair in the window, which is also bracketed under its cells.
- _Best at_ the trip question: which new moon, and which weekend.
- _Weak at_ dates: weekdays land in different columns on every row, and full-moon nights are
  deliberately left out.

### Table

The numbers behind the charts, one month at a time: sunset, astronomical dusk and dawn, sunrise,
illumination, moonrise, moonset, true dark, moon-free total and windows. It is also the accessible
twin of the charts.

### Shared pieces

- **Inspector** (right panel). The selected night as the familiar altitude chart: sun and moon
  altitude over the phase bands, with moon-free time hatched green. Below it: stage start times
  and durations for evening and morning, moon phase with rise and set, and **Dark weekends
  ahead**, the best Friday–Saturday pair near each upcoming new moon.
- **Planning thresholds.** _Moon counts once above_ (0°–15°) allows for a tree line or hills.
  _Ignore a moon under_ (10–30% lit) is for people who don't mind a thin crescent. Both change
  every number and the weekend picks, not just the drawing.
- **Site.** Name, latitude, longitude and IANA time zone, saved only in the browser. The default is
  Seattle.
- **Keyboard.** ←/→ previous or next night, ↑/↓ a week, T tonight, 1–5 switch views, Esc
  collapses an expanded week.

## Why River is the default

- **It shows why a night is good**, not just that it is: where the dark falls in the night, and
  how that moves from night to night.
- **One mental model from a year down to one night.** Only the row height changes, and a row looks
  like the single-night chart.
- **Focusing on new moons is just taller rows**: no mode switch, nothing new to learn.
- **It suits any renderer**: one canvas that draws only the visible rows on a fixed axis, so live
  updates never shift the layout.

The other views stay because they win specific tasks. The Calendar suits anyone who thinks in
weeks, and a public "year at a glance"; Lunations suits choosing between new moons and weekends.
The long-term direction is to let each astronomer pick the view and the metrics that suit them.

## Decisions and alternatives

Rationale that isn't obvious from the result:

- **Moonlight wash.** A bright beige wash dominated the chart and read brighter than nautical
  twilight. The current warm grey, with opacity 0.17 + 0.40 × illumination^0.8, keeps a full moon
  near late nautical twilight's brightness.
- **Marking moon-free time.** The single-night chart hatches moon-free time green. At month scale
  hatching turns into noise, so the month views use black plus a thin green edge. The River's
  _Black only_ toggle lets you compare.
- **Altitude curves.** Curves in every calendar cell were unreadable at cell size, so they appear
  only in Week zoom, expanded weeks and the inspector.
- **Clock time versus elapsed time.** The month views use clock time, which is what you plan with.
  The inspector's chart uses elapsed time, like AllSky's Swift chart, so the repeated hour on a
  fall-back night doesn't fold the curves.
- **Considered and not built.** A radial year clock was pretty, but it made times hard to read and
  nights hard to compare. A plain heat-map calendar loses _when_ in the night the dark falls.
