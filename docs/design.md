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
- Light, Dark and Observing are designed palettes, selected by a visible control and saved in
  this browser. System follows the device's light/dark preference. Explicit choices apply before
  the first paint and switching palettes preserves the browsed night and selection.
  Observing uses warm neutral lightness steps designed for a separately enabled OS red-only
  accessibility filter; it does not enable the device filter. Accepted moonlight gains a dashed
  boundary so hue is not its only cue. Normal Light and Dark retain their rich colors.
  Canvas colors come from the theme tokens in `src/styles/atlas.css`,
  and the sky ramp is tuned per theme so the day band doesn't glare in dark mode. Labels drawn on
  sky colors pick white or ink by the background's luminance.

## The views

### River (default)

One row per night, stacked by date. Clock time runs left to right on a fixed axis from the loaded
range's earliest sunset to its latest sunrise. A row is the single-night chart's phase shading,
flattened.

- **Year and Month.** Year fits the loaded range on one screen, at about 2 px per night, and
  stays compact when selecting nights. Month uses 20 px rows on desktop and 32 px rows on phones
  for easier tapping. Window times appear wherever both fit, with quieter weekday labels.
  Short windows retain their duration in the right gutter; exact times are available on expansion.
  Week zoom has been replaced by individual night expansion. Saved Week preferences open Month.
- **Expand a night.** Clicking or tapping a Month row opens just that night; activating its
  timeline again collapses it without clearing selection. Its sky band keeps its compact row
  height on the same clock axis. Every Sun/twilight boundary, Moon rise/set within the displayed hours, and
  additional threshold-defined usable boundary gets a time callout connected to its actual position.
  Solar callouts stay on four fixed levels (sunset/rise, civil, nautical and astronomical),
  with Moonrise, Moonset and additional usable-window boundaries sharing one level below. Crowded labels move horizontally within
  their own level; Moon events cannot move twilight times. Each usable window has a green bracket
  and duration at the top of the expansion. Its body stays 179 px high, including reserved space
  for occasional clock-change or threshold notes, so keyboard scrubbing cannot change row geometry.
  Selection outlines span the whole night, including both gutters, at the same width whether
  collapsed or expanded. Nights with no usable window show the reason at the duration position
  instead of repeating a zero total and a separate explanation.
  Moon illumination sits directly below the gutter's phase icon, with the written phase name
  on two compact lines beneath the percentage. The first solar level leaves that gutter clear. The expansion omits the date-range
  footer, time zone and Collapse button; tapping the header, Enter/Space or Escape controls it.
  Callouts are selectable SVG text with an accessible event/time description. Interacting with
  them does not toggle the row. The detail body and callout backings use the chart's panel surface,
  keeping the expansion continuous with its surroundings in both themes.
  River has no Full detail button or inspector sidebar: its chart uses
  the full width, with Dark weekends ahead preserved in a collapsible tray below it.
- **Selection and scrolling.** Enter or Space on the chart toggles expansion; Escape collapses.
  Arrow keys retain their night/week steps. An open expansion follows selection, keeping its header
  at the same visible position when possible; closed rows stay closed during keyboard navigation.
  A tapped header retains its position through layout, followed by only the scroll needed to reveal
  details. Oversized details can be scrolled in the chart beneath the pinned axis. Native touch
  pans do not activate rows. Scrolling does not close or follow the selected night. Resizing,
  zoom and focus changes preserve the top visible night and fraction of its row, within range
  boundaries. Year does not expand; returning to Month with an open selected night reveals it.
- **New-moon focus (±N)** is a fisheye: nights within N of a new moon open up with window times,
  and the rest squash to thin context lines. The compressed date gutter keeps a sparse scaffold:
  month names with years, plus Monday dates as weekly anchors, in the same readable 11.5 px text
  in Month zoom. Short gutter ticks point to the exact nights. Month labels take priority
  when a Monday is less than 16 px away; its tick stays visible. Labels too close to the pinned
  axis or bottom edge are omitted rather than clipped. Expanded nights retain daily labels, and
  compressed Friday/Saturday gutters keep the weekend tint. The label backings stay in the date
  gutter; Month focus gives that gutter four extra pixels on phones to fit the year labels. Row heights,
  selection and navigation stay unchanged. The selected expanded night stays readable even outside
  the focus window. Year zoom ignores focus.
- **New-moon events.** Month centers a **New Moon** label with the event's site-local date and
  time between that night's sunset and sunrise on the clock axis, including when expanded. If
  either Sun boundary is absent, the label uses the center of the displayed axis. An opaque contrasting backing keeps it readable
  over black and twilight alike; the ordinary phase glyph remains in the gutter. On phones the
  label uses two lines within the existing row height and takes the place of compact window-time
  labels on that row; its duration remains in the right gutter and expansion shows all boundaries.
  Year uses a short high-contrast horizontal gutter tick instead. Its phone date gutter reserves
  enough width to keep the January/year label clear of the ticks. These cues use the existing event assignment and
  remain visible with focus off or on, without changing the sky shading or row heights. The
  illumination-based written phase can say “New moon” on several nights, while the central label
  or Year tick identifies just one event-associated night.
- **Gutters.** The left gutter holds date and weekday (weekends tinted and bold) and a moon phase
  glyph, replaced by a tick for Year's new-moon event rows. The first of a month uses its month
  name in place of the weekday. On the right, a bar and
  value give moon-free duration per night, in hours and minutes matching the inspector (for
  example, "8h 5m"). The duration column is wider than in Year zoom to fit these values on phones.
  The pinned axis names the top visible month (abbreviated
  with its year on narrow screens). In Month zoom on desktop, a minimap of the whole range
  sits at the right edge. Its nights remain equally spaced when a main row expands; its viewport
  maps the visible dates through the variable row heights. Its three-letter month labels, month ticks, stronger January boundary
  and range-year heading keep the overview readable. A shaded amber viewport with a center grip
  shows the visible dates; its grab area is at least 24 px tall, even with an expanded night. Grab it anywhere
  inside its outline to drag without recentering. Clicking outside the viewport centers that date
  and can continue into a drag. Dragging tracks continuous date position, including unequal
  focus/context rows, and clamps at the range ends. Selection and the inspector stay unchanged.
- **Fixed readout.** River has no floating night tooltip. A reserved strip below the chart shows
  the pointed-at date, site-local clock time, sky stage and explicitly labeled Moon center
  altitude in Month. "Astronomical darkness" describes the sky stage independently of
  whether the Moon is up. In Year, or when pointing at a date or duration gutter, it shows the
  night's moon-free duration and full window times (or why there is none). The crosshair and
  axis clock label remain. Leaving the chart clears pointer information; clicking, tapping or
  keyboard navigation shows the selected night's summary without requiring hover. Moving the
  pointer previews other nights without changing selection. The readout has
  fixed height in each responsive layout so updates cannot move the chart, and pointer updates
  are not a live region. On a new-moon event's assigned night, both pointer and selection readouts
  include the event's site-local date and time, rounded to the nearest minute. This is distinct
  from the row's evening date: the event can occur during daylight or on a different civil date.
  Boundary event times appear in the expanded row.
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

### Shared pieces

- **Inspector** (right panel in Calendar and Lunations). The selected night as the familiar
  altitude chart: sun and moon
  center altitude over the phase bands, with ordinary moonlight in warm grey and accepted
  moonlit time in illumination-scaled green. The sampled curves
  illustrate position; all Moon event times and window boundaries are separately refined. Below
  it: stage start times
  and durations for evening and morning, moon phase with rise and set, and **Dark weekends
  ahead**, the best Friday–Saturday pair near each upcoming new moon. River keeps that weekend
  list in a separate collapsible tray and puts event details on the expanded timeline.
- **Planning thresholds.** _Moon’s upper edge above_ (0°–15°) allows for a tree line or hills.
  The Moon counts as up while any part of its refracted disk
  clears that height; Moonrise and Moonset use the upper edge at the natural horizon.
  _Ignore a moon under_ (10–30% lit) is for people who don't mind a thin crescent. Both change
  every number and the weekend picks, not just the drawing.
- **Site.** A keyboard-accessible dialog holds named local favorites, with add, edit, duplicate
  and confirmed removal. The name, coordinates, IANA zone and optional elevation are saved
  together; the existing saved site becomes the initial favorite. Choosing a favorite fills a
  draft; Save & use applies its complete record. Cancel and Escape discard form edits.
  Removing an active favorite leaves the current plan open until another site is used.
  One field accepts decimal latitude/longitude or documented full coordinate-bearing Google Maps
  search links, parsed entirely locally with a coordinate preview. Camera-only, ambiguous and
  short links receive guidance instead of a guessed location; imported URLs are not retained.
  A same-origin worker infers the zone from bundled boundary data, including offline. A visible
  editable zone supports manual overrides; ambiguous results require a choice. The location UI
  credits the ODbL data and links its matching dataset, with full notices available in the guide.
  Unknown/damaged favorites are left untouched, and unavailable storage is explained.
  Blank elevation uses sea level; existing saved sites keep their coordinates.
  Elevation adjusts observer position and idealized refraction while assuming
  a level horizon, with no terrain lookup. The default is Seattle. Beside the location, a reserved
  readout shows the site's current local date/time, abbreviation, UTC offset and IANA zone.
  It updates each minute, on returning to the page and immediately on site changes; chart
  selection does not affect that clock.
- **Keyboard.** ←/→ previous or next night, ↑/↓ a week, T tonight, 1–4 switch views, Esc
  collapses an expanded River night or Calendar week. Enter/Space toggles the selected River
  Month night when the chart has focus.

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
  curves appear in expanded Calendar weeks and the inspector. River expansions use boundary
  callouts on the shared clock axis rather than an altitude plot.
- **Clock time versus elapsed time.** The month views use clock time, which is what you plan with.
  The inspector's chart uses elapsed time, so the repeated hour on a
  fall-back night doesn't fold the curves.
- **Considered and not built.** A radial year clock was pretty, but it made times hard to read and
  nights hard to compare. A plain heat-map calendar loses _when_ in the night the dark falls.
