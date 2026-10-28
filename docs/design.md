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
  where moonlight is what matters. It follows the Moon’s upper edge at the natural horizon (0°),
  independently of planning thresholds.
- **Moon-free true dark** is black, without an edge marker. Green marks duration bars and
  totals rather than boundaries in the night bands.
- **Accepted moonlight** uses a green wash with the same illumination-based opacity as ordinary
  moonlight. Only the intersection of natural-horizon moonlight, true dark and accepted planning
  windows is green. The green tint replaces the ordinary wash there rather than layering over it,
  so brightness continues to represent illumination. Raising the Moon-altitude threshold or ignoring
  a crescent can add green time; truly moon-free time stays plain black. The inspector uses the same
  treatment.
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
  Month uses 20 px rows, with moon-free start/end times wherever both times fit inside the window.
  Weekday times are quieter than weekend and selected-night times; short
  windows still have their duration in the right gutter. Clock-change notices take
  priority over times in compact rows. Week uses 48 px rows, with 11.5 px centered moon-free window
  times and duration totals, and 12 px daily dates. Sky and moon-up shading carry the same
  information as Month. A clock-change notice sits above the window labels. Week's expanded focus
  rows also use 48 px; compressed context rows retain their 14 px height and existing type sizes.
  Week's phone date gutter is four pixels wider to give the larger dates a clear margin.
  Exact Sun/Moon event times and altitude
  curves are available in the inspector. Window-time pairs use measured text widths in all
  horizontal bars, including the Calendar.
  Changing zoom or new-moon focus preserves the top visible night and the fraction of its row
  already scrolled past, as far as the range boundaries allow. Selection and the inspector stay
  on the chosen night while browsing elsewhere.
- **New-moon focus (±N)** is a fisheye: nights within N of a new moon open up with window times,
  and the rest squash to thin context lines. The compressed date gutter keeps a sparse scaffold:
  month names with years, plus Monday dates as weekly anchors, in the same readable 11.5 px text
  in Month and Week zoom. Short gutter ticks point to the exact nights. Month labels take priority
  when a Monday is less than 16 px away; its tick stays visible. Labels too close to the pinned
  axis or bottom edge are omitted rather than clipped. Expanded nights retain daily labels, and
  compressed Friday/Saturday gutters keep the weekend tint. The label backings stay in the date
  gutter; Month focus gives that gutter four extra pixels on phones to fit the year labels. Row heights,
  selection and navigation stay unchanged. Year zoom ignores focus.
- **Gutters.** The left gutter holds date and weekday (weekends tinted and bold) and a moon phase
  glyph. The first of a month uses its month name in place of the weekday. On the right, a bar and
  value give moon-free duration per night, in hours and minutes matching the inspector (for
  example, "8h 5m"). The duration column is wider than in Year zoom to fit these values on phones.
  The pinned axis names the top visible month (abbreviated
  with its year on narrow screens). In Month and Week zoom on desktop, a minimap of the whole range
  sits at the right edge. Its three-letter month labels, month ticks, stronger January boundary
  and range-year heading keep the overview readable. A shaded amber viewport with a center grip
  shows the visible dates; its grab area is at least 24 px tall, even in Week zoom. Grab it anywhere
  inside its outline to drag without recentering. Clicking outside the viewport centers that date
  and can continue into a drag. Dragging tracks continuous date position, including unequal
  focus/context rows, and clamps at the range ends. Selection and the inspector stay unchanged.
- **Fixed readout.** River has no floating night tooltip. A reserved strip below the chart shows
  the pointed-at date, site-local clock time, sky stage and explicitly labeled Moon center
  altitude in Month and Week. "Astronomical darkness" describes the sky stage independently of
  whether the Moon is up. In Year, or when pointing at a date or duration gutter, it shows the
  night's moon-free duration and full window times (or why there is none). The crosshair and
  axis clock label remain. Leaving the chart clears pointer information; clicking, tapping or
  keyboard navigation shows the selected night's summary without requiring hover. Moving the
  pointer previews other nights without changing the selection or inspector. The readout has
  fixed height in each responsive layout so updates cannot move the chart, and pointer updates
  are not a live region. Sun and Moon event details remain in the inspector.
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
  center altitude over the phase bands, with ordinary moonlight in warm grey and accepted
  moonlit time in illumination-scaled green. The sampled curves
  illustrate position; all Moon event times and window boundaries are separately refined. Below
  it: stage start times
  and durations for evening and morning, moon phase with rise and set, and **Dark weekends
  ahead**, the best Friday–Saturday pair near each upcoming new moon.
- **Planning thresholds.** _Moon’s upper edge above_ (0°–15°) allows for a tree line or hills.
  The Moon counts as up while any part of its refracted disk
  clears that height; Moonrise and Moonset use the upper edge at the natural horizon.
  _Ignore a moon under_ (10–30% lit) is for people who don't mind a thin crescent. Both change
  every number and the weekend picks, not just the drawing.
- **Site.** Name, latitude, longitude, IANA time zone and optional elevation in metres above sea
  level, saved only in the browser. Blank elevation uses sea level; existing saved sites keep
  their coordinates. Elevation adjusts observer position and idealized refraction while assuming
  a level horizon, with no terrain lookup. The default is Seattle.
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
- **Marking planning windows.** A thin green edge was hard to interpret when planning thresholds
  accepted time beyond strictly moon-free darkness. Accepted moonlit time now uses a green wash
  instead of hatching. Its opacity follows the same 0.17 + 0.40 × illumination^0.8 curve as ordinary
  moonlight, with green RGB values chosen for comparable luminance in each theme. Truly moon-free
  time stays plain black. Green duration bars and totals still identify all usable time.
- **Altitude curves.** River's Moon-up shading carries the effect on usable dark time. Altitude
  curves appear in expanded Calendar weeks and the inspector.
- **Clock time versus elapsed time.** The month views use clock time, which is what you plan with.
  The inspector's chart uses elapsed time, so the repeated hour on a
  fall-back night doesn't fold the curves.
- **Considered and not built.** A radial year clock was pretty, but it made times hard to read and
  nights hard to compare. A plain heat-map calendar loses _when_ in the night the dark falls.
