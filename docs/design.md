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
- **Moon-free true dark** is black, without an edge marker. Green identifies duration bars, total markers and usable-window brackets. Small numeric
  labels use normal ink for contrast; the night bands retain their sky-stage colors.
- **Accepted moonlight** uses a green wash with the same illumination-based opacity as ordinary
  moonlight. Only the intersection of natural-horizon moonlight, true dark and accepted planning
  windows is green. The green tint replaces the ordinary wash there rather than layering over it,
  so brightness continues to represent illumination. Raising the Moon-altitude threshold or ignoring
  a crescent can add green time; truly moon-free time stays plain black. Night details use the same
  treatment.
- **Weekends** (Friday and Saturday nights) get an amber tint, **selection** is an amber outline,
  and **tonight and now** are blue.
- **Time** is the site's local clock time, including daylight saving time. The one-hour jump on a
  clock-change night is real, and the River labels it.
- Light, Dark and Observing are designed palettes, selected by a compact native dropdown with
  short labels and saved in this browser. OS red-filter setup belongs in How it works.
  System follows the device's light/dark preference. Explicit choices apply before
  the first paint and switching palettes preserves the browsed night and selection.
  Observing uses warm neutral lightness steps designed for a separately enabled OS red-only
  accessibility filter; it does not enable the device filter. Accepted moonlight gains a dashed
  boundary so hue is not its only cue. Normal Light and Dark retain their rich colors.
  Canvas colors come from the theme tokens in `src/styles/atlas.css`,
  and the sky ramp is tuned per theme so the day band doesn't glare in dark mode. Labels drawn on
  sky colors pick white or ink by relative contrast. Dark's day band stays lighter than civil
  twilight, and the guide's shared swatches check decreasing lightness and label contrast in
  every palette.

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
  value give moon-free duration per night, in hours and minutes matching the night detail (for
  example, "8h 5m"). The duration column is wider than in Year zoom to fit these values on phones.
  The pinned axis names the top visible month (abbreviated
  with its year on narrow screens). In Month zoom on desktop, a minimap of the whole range
  sits at the right edge. Its nights remain equally spaced when a main row expands; its viewport
  maps the visible dates through the variable row heights. Its three-letter month labels, month ticks, stronger January boundary
  and range-year heading keep the overview readable. A shaded amber viewport with a center grip
  shows the visible dates; its grab area is at least 24 px tall, even with an expanded night. Grab it anywhere
  inside its outline to drag without recentering. Clicking outside the viewport centers that date
  and can continue into a drag. Dragging tracks continuous date position, including unequal
  focus/context rows, and clamps at the range ends. Selection and the night detail stay unchanged.
  A keyboard scrollbar overlays the same minimap when focused: arrows browse nights, Page Up/Down
  browse screens and Home/End reach the range ends without selecting a different night.
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

A familiar calendar for choosing dates. Month, Week and Year each fit their complete period into
the chart, including six-row months. The calendar uses neutral cells and clear gridlines; sky
bands and Friday/Saturday coloring do not appear in Month or Year.

- **Month summaries.** **Hours first** is the default: each evening date leads with its usable-dark
  duration under the current Moon settings. **Windows first** leads with the clock range, with the
  usable total secondary where space permits. Multiple intervals are labeled as separate windows,
  never joined into a misleading continuous range. The two choices persist in this browser and
  travel in share links. This is one presentation preference, rather than a general cell editor.
  Small cells use compact durations or two stacked clock times; exact facts remain in the detail.
- **Moon context.** A quiet glyph and, where space permits, illumination accompany the date.
  New moons are marked on the event's actual site-local civil date. This can differ from the
  evening date of the event-associated night in River or the centered cycle in Lunations.
- **Complete weeks.** Each month keeps seven Sunday-first columns. Adjacent months' dates are
  dimmed and selectable if loaded, without repeating their summaries. Selecting one keeps the
  current month page. Unloaded neighboring dates show a dash and cannot be selected.
- **Week detail.** Seven nights share a clock axis from their earliest sunset to latest sunrise,
  padded to half hours. Evening is at the top and morning below. The shared sky/Moon renderer
  supplies the same colors and accepted-moonlight treatment as River and Lunations. Thin green
  boundaries mark usable intervals; endpoint times appear when there is room, with every interval
  available on selection. The entire night fits without scrolling through a 24-hour schedule.
- **Year navigation.** Twelve quiet mini calendars cover January through December, with actual
  new-moon dates marked and usable-hour totals. Opening a year loads a January-based 14-month
  range if the rolling range does not contain all twelve months. Previous/Next moves a calendar
  year, and Tonight returns to the site's current observing night. Each entire mini calendar is a
  keyboard/touch month button. Phones and short windows show twelve compact month choices with
  totals and new-moon dates, rather than microscopic day grids.
- **Shared night drawer.** Selecting a Month or Week date opens the same horizontal event
  timeline used by River and Lunations at the bottom of the chart. The drawer overlays the
  overview without shrinking its rows. It includes ordered Sun/Moon events, every usable window,
  phase, illumination and threshold/clock-change notes. Activate a visible date again, use Close
  or Escape to collapse. Enter/Space toggles; Left/Right select neighboring nights and Up/Down move
  a week, carrying an open drawer. Native touch swipes do not select a night.
- **Focus and settings.** New-moon focus quiets daily summaries without removing dates or changing
  row heights. Planning settings open in a collapsible panel above the calendar, keeping the
  normal phone overview on one screen. The fixed readout previews a pointed-at night and otherwise
  summarizes the selection. Richer seasonal profiles and the weekend ranking remain in River.
- **Sharing.** Month/Week, the selected evening date, drawer and month-presentation preference are
  reproducible through the existing site-optional links. Incoming settings remain temporary until
  saved. Earlier links and the old orientation preference remain readable, with summary cells
  replacing the former Time ↓ / Time → month layouts.
- _Best at_ choosing familiar dates, comparing a week and locating new moons across a year.
- _Weak at_ the continuity of long-term patterns; River and Lunations provide those comparisons.

### Lunations

One row per lunar cycle, aligned so the new-moon night is the center column. **Full cycle** uses
31 fixed positions, −15 through +15; each cell is a night column, as in Calendar's Week.
Each whole night belongs to the new moon nearest its site-local midnight, with exact ties going
to the earlier event. This makes boundaries fall between nights around the midpoint of adjacent
new moons. Every loaded night appears exactly once, including dates around full moon and range
edges whose new moon lies outside the loaded dates. Complete cycles normally fill 29 or 30
positions; quiet empty edge positions preserve equal column widths and the centered new moon.
New-moon focus crops each cycle to ±N without changing ownership.

- The full-width chart has no inspector sidebar. Every cycle has a 240 px sky band, on the same
  site-local clock scale throughout the loaded range. Evening is at the top and morning at the
  bottom; a clock rail and stronger midnight guide make the direction explicit. The usable window
  forms a diamond around new moon, so cycles and seasons compare straight down the page.
- A real heading above each row gives the exact new moon's local date/time, the displayed evening
  date range, usable total and best Friday–Saturday pair. The total opens an explanation by keyboard
  or tap and has the same explanation on hover. It sums the displayed nights, including all usable
  pieces; partial range edges are explicitly labeled using the cycle's actual owned count, rather
  than counting alignment padding as missing nights. Month boundaries also appear in the daily
  labels and as quiet dividers. Weekend rules and ranking are unchanged.
- Beneath each sky band, one green bar per night shows usable hours. Its zero-based hours scale is
  shared by every cycle, with per-night numeric hours and a bracket marking the best weekend.
  Threshold-accepted moonlight contributes to these usable totals, just as it does in River.
- Selecting a night opens one full-width horizontal timeline beneath its cycle, using River's
  ordered event callouts, usable-window brackets, phase and illumination. Activate the night again,
  use the Close control, or press Escape to collapse. Enter/Space toggles the selected night;
  Left/Right visit displayed nights, skipping omitted dates, while Up/Down preserve the new-moon
  offset in the preceding/following cycle. An open detail follows selection. The quiet fixed readout
  previews pointed-at nights and otherwise summarizes selection; there is no floating night tooltip.
- At phone width (600 px and below), the initial window is ±3, without changing River/Calendar or
  writing a preference. An explicit saved focus choice or shared link takes precedence, including
  Full cycle (the existing Off/zero preference). Resizing preserves the browsed cycle, position and selected night. Requested wider windows
  keep at least 40 px per column and pan together inside the chart; the page itself never scrolls
  horizontally. The clock rail, row headings and selected-night detail retain the viewport width.
  If selection is outside a reduced window, its expanded timeline remains available and says so.
- _Best at_ the trip question: which new moon, and which weekend.
- _Weak at_ weekday structure: weekdays land in different columns on every row. Full cycle needs
  chart panning on phones; the initial ±3 crop favors new-moon planning there.

### Shared pieces

- **Sharing.** A versioned, validated URL fragment carries the first of 14 loaded months, current
  view/zooms/orientation, focus, thresholds, selected evening date and River/Lunations expansion. The site
  record is omitted by default; the Share dialog explains that recipients use their own site and
  may see different results. Explicit inclusion previews name, coordinates, zone and optional
  elevation and explains copied-link/history exposure. Opening a link applies temporary controls
  and an optional temporary site without overwriting saved preferences or favorites. Keeping view
  settings and saving the included site are separate deliberate actions. Theme stays personal.
  A notice can restore the viewer's saved plan. Copy failure selects the link for manual copying.
  Links use readable named fields such as `#npa=1&view=river&start=2026-09`, omitting fixed defaults
  to keep them short; `crescent` is an integer percentage. Earlier encoded JSON links still open.
  Plans remain self-contained, with no link-shortening service or server-stored lookup.
- **How it works.** One offline page with in-page navigation, practical reading instructions,
  a worked Seattle night, and expandable calculation/reference detail. Its sky ramp shares chart
  tokens and contrast-selected ink; an upper-edge/center diagram explains Moon events. Measured
  comparison results distinguish independent USNO/solar references from same-ephemeris crossing
  checks. Site workflows, keyboard use, observing-filter setup, limitations, privacy and full
  offline third-party notices stay with the explanation. The page uses the full width and hides
  chart-specific controls while it is open.
- **Night details.** All three views share ordered event annotations on the same clock axis,
  with illumination, phase, individual usable-window durations and threshold/clock-change notes.
  Calendar uses a bottom drawer and Lunations places the full-width panel beneath its cycle. River
  annotates its selected row directly. A fixed readout previews nights without changing selection
  and lists every separate usable window. River keeps **Dark weekends ahead** in a collapsible
  tray, using the same Friday/Saturday ranking.
- **Planning thresholds.** _Moon’s upper edge above_ (0°–15°) allows for a tree line or hills.
  The Moon counts as up while any part of its refracted disk
  clears that height; Moonrise and Moonset use the upper edge at the natural horizon.
  _Ignore a moon under_ (10–30% lit) is for people who don't mind a thin crescent. Both change
  every number and the weekend picks, not just the drawing.
- **Site.** A native dropdown switches directly between named local favorites. **Manage sites…**
  opens the keyboard-accessible editor, with add, edit, duplicate and confirmed removal. The name,
  coordinates, IANA zone and optional elevation are saved together; the existing saved site becomes
  the initial favorite. Shared or unsaved sites remain visible as the current selection.
  In the editor, choosing a favorite fills a draft; Save & use applies its complete record.
  Cancel and Escape discard form edits and return focus to the opener.
  Removing an active favorite leaves the current plan open until another site is used.
  One field accepts decimal latitude/longitude or documented full coordinate-bearing Google Maps
  search links, parsed entirely locally with a coordinate preview. Camera-only, ambiguous and
  short links receive guidance instead of a guessed location; imported URLs are not retained.
  A same-origin worker infers the zone from bundled boundary data, including offline. A visible
  editable zone supports manual overrides; clearing it infers the zone when saving. Ambiguous
  results require a choice. Validation errors sit beside their fields, mark the invalid control
  and focus it on Save. Coordinates parsed from a Maps link appear directly below its input;
  decimal entries do not repeat. Saved-site names use coordinates only to distinguish duplicate
  names. Both site selectors retain native selection behavior, with consistent
  closed-control styling. The guide credits the ODbL data and links its matching dataset and full
  notices alongside the other credits.
  Unknown/damaged favorites are left untouched, and unavailable storage is explained.
  Blank elevation uses sea level; existing saved sites keep their coordinates.
  Elevation adjusts observer position and idealized refraction while assuming
  a level horizon, with no terrain lookup. The default is Seattle. Beside the location, a reserved
  readout shows the site's current local date/time, abbreviation, UTC offset and IANA zone.
  It updates each minute, on returning to the page and immediately on site changes; chart
  selection does not affect that clock.
- **Keyboard.** ←/→ previous or next night, ↑/↓ a week, T tonight, 1–4 switch views, Esc
  collapses an expanded River/Lunations night or Calendar drawer. Enter/Space toggles the selected
  River Month, Calendar Month/Week or Lunations night when the chart has focus. Lunations uses Up/Down for cycles and
  Left/Right for displayed nights. The chart and minimap retain a visible focus outline.
  River and Lunations' selected-night summaries include the local zone, full windows and usable duration;
  pointer previews do not update that live announcement. Site dialogs contain their keyboard
  navigation and return focus to their opener on closing. Muted date/control text keeps
  readable contrast in each palette, with additional forced-color focus/boundary cues.

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
- **Night expansion.** Exact times have more space and a predictable order on a horizontal
  timeline. Calendar's two seven-cell expansion treatments have been replaced by the same
  event callouts used in River and Lunations. The sky bands retain the Moon's effect on usable
  darkness; River's pointer readout supplies sampled Moon-center altitude when needed.
- **Clock time versus elapsed time.** Charts use site-local clock time, which is what observers
  plan with. Shared night details mark clock changes, and window durations add actual elapsed
  time across repeated or skipped hours.
- **Considered and not built.** A radial year clock was pretty, but it made times hard to read and
  nights hard to compare. A plain heat-map calendar loses _when_ in the night the dark falls. Calendar now separates
  the month summary from the detailed week and selected-night timeline, keeping each period visible.
