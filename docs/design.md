# Design

Night Planner Atlas answers one question from several angles: when is it really dark at my site,
and which nights are worth the trip? This document describes the current views, the visual
language they share, and the reasoning behind the choices. Remaining work and ideas live in
GitHub issues.

## What a night is

Each night is labeled by the local date of its evening and runs from local noon to the next local
noon. For every night the site knows the eight sun events (sunset; civil, nautical and
astronomical dusk; astronomical, nautical and civil dawn; sunrise), the moon's altitude through the
night, and its illumination. The Sun determines **astronomical darkness**. The Moon settings
determine which parts count as **usable dark**, the headline number. By default, usable dark
requires the Moon to be below the horizon. [night-model.md](night-model.md) defines both measures.

## Visual language

One encoding everywhere, so a night looks the same in every view and in the single-night chart:

- **Sky darkness** is an ordered ramp that darkens monotonically: day, civil twilight (warm, like
  the dusk sky), nautical twilight (blue), astronomical twilight (indigo), and astronomical
  darkness (near black). Lightness carries the order; hue only helps tell neighbors apart.
- **Moonlight** washes astronomical darkness toward a warm grey, varying through the night with
  lunar phase-dependent brightness and altitude. A fixed-reference scattering model feeds a
  perceptual opacity curve: a 0.17 floor keeps Moon-up time recognizable, a square-root lift makes
  faint moonlight legible, and a 0.57 ceiling retains the familiar full-Moon brightness. This is an
  illustrative cue, not a prediction of local sky brightness or an observing-quality cutoff.
  The wash follows the Moon’s upper edge at the natural horizon (0°), only during astronomical
  darkness and independently of planning thresholds. It uses the same samples in every chart and
  guide example; the detailed mapping and bounded near-zenith treatment are in `night-model.md`.
- **Moon-free astronomical darkness** is black. Green identifies duration bars, total markers and usable-window brackets. Small numeric
  labels use normal ink for contrast; the night bands retain their sky-stage colors.
- **Accepted moonlight** uses a green wash with the same phase-and-altitude opacity as ordinary
  moonlight. Only the intersection of natural-horizon moonlight, astronomical darkness and accepted planning
  windows is green. The green tint replaces the ordinary wash there rather than layering over it,
  so the brightness curve is continuous across an accepted boundary. Raising the Moon-altitude threshold or ignoring
  a crescent can add green time; truly moon-free time stays plain black. Night details use the same
  treatment.
- **Weekends** (Friday and Saturday nights) get an amber tint, **selection** is an amber outline,
  and **tonight and now** are blue.
- **Time** is the site's local clock time, including daylight saving time. The one-hour jump on a
  clock-change night is real, and the River labels it.
- Light, Dark and Observing are designed palettes, selected in More’s Theme group with a checkmark
  on the current preference and saved in this browser. OS red-filter setup belongs in How it works.
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

- **Year and Month.** Year fits one row per loaded night on one screen and marks January
  transitions. A calendar year starts at January 1 and ends at December 31. Year stays compact
  when selecting nights. Month uses 20 px rows on desktop and 32 px rows on phones
  for easier tapping. Window times appear wherever both fit, with quieter weekday labels.
  Short windows retain their duration in the right gutter; exact times are available on expansion.
  Week zoom has been replaced by individual night expansion. Saved Week preferences open Month.
- **Row separators.** In Light, a muted slate backdrop keeps the one-pixel Month gaps and the
  fine seams between Year rows quiet against moon-free darkness. Gutters and expanded details
  retain the panel surface, and Year keeps its stronger January boundary. Dark and Observing
  retain their panel-colored separators.
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
  River uses the full width for its chart and puts night details directly on the selected row.
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
  value give usable dark per night, in hours and minutes matching the night detail (for
  example, "8h 5m"). The duration column is wider than in Year zoom to fit these values on phones.
  The pinned axis names the top visible month (abbreviated
  with its year on narrow screens). In Month zoom on desktop, a minimap of the whole range
  sits at the right edge. Its nights remain equally spaced when a main row expands; its viewport
  maps the visible dates through the variable row heights. Its three-letter month labels, month ticks, stronger January boundary
  and range-year heading keep the overview readable. Short charts omit crowded month labels,
  preserving January's label and every month tick. A shaded amber viewport with a center grip
  shows the visible dates; its grab area is at least 24 px tall, even with an expanded night. Grab it anywhere
  inside its outline to drag without recentering. Clicking outside the viewport centers that date
  and can continue into a drag. Dragging tracks continuous date position, including unequal
  focus/context rows, and clamps at the range ends. Selection and the night detail stay unchanged.
  A keyboard scrollbar overlays the same minimap when focused: arrows browse nights, Page Up/Down
  browse screens and Home/End reach the range ends without selecting a different night.
- **Fixed readout.** River has no floating night tooltip. On pointer devices, a reserved strip below the chart shows
  the pointed-at date, site-local clock time, sky stage and explicitly labeled Moon center
  altitude in Month. "Astronomical darkness" describes the sky stage independently of
  whether the Moon is up. In Year, or when pointing at a date or duration gutter, it shows the
  night's usable dark duration and full window times (or why there is none). The crosshair and
  axis clock label remain. Leaving the chart clears pointer information; clicking or
  keyboard navigation shows the selected night's summary without requiring hover. Moving the
  pointer previews other nights without changing selection. The readout has
  fixed height in each responsive layout so updates cannot move the chart, and pointer updates
  are not a live region. On a new-moon event's assigned night, both pointer and selection readouts
  include the event's site-local date and time, rounded to the nearest minute. This is distinct
  from the row's evening date: the event can occur during daylight or on a different civil date.
  Boundary event times appear in the expanded row.
  Touch devices omit this strip in every chart, giving its height back to the nights. Tapping
  still updates the accessible selection announcement; expanded details provide the visible facts.
- _Best at_ showing the shape: the moon leaving the evening dark after full, the whole night open
  at new moon, the dark sliding to the mornings as the moon waxes. It also shows the seasonal
  hourglass and clock changes.
- _Weak at_ weekday structure, since it is a list and not a grid, and at keeping your place in a
  long scroll. The minimap and Year zoom help with the second.

### Calendar

A familiar calendar for choosing dates. The period selector reads Year, Month, Week and defaults
to Month. Neutral cells and clear gridlines keep the dates legible in every theme; sky bands and
Friday/Saturday coloring do not appear in Month or Year.

- **Scrolling periods.** Month and Week form continuous vertical sequences across the loaded
  range. Wheel and touch scrolling browse periods without changing the selected night; the chart's
  period label follows the top of the viewport. Native titles scroll with each period.
  Desktop months fit the chart, including six-row months. Phones and
  short screens retain readable minimum row heights and can scroll the remainder. Resizing and
  planning changes preserve the browsed position.
- **Month summaries.** Each evening date leads with its usable-dark duration under the current
  Moon settings, followed by a slightly smaller clock range. Narrow cells stack the start and end
  times. Multiple intervals are labeled as separate windows, never joined into a continuous range;
  exact intervals remain in the expansion. There is no presentation selector.
- **Duration bars.** An inset vertical green bar at the right of each Month cell grows upward
  from a shared baseline within its row. Its width grows from 3 to 18 pixels with the cell width,
  with space reserved for labels. Its height makes daily differences clear across the week.
  All months share the same maximum bar height and hours scale. Year day cells use horizontal bars
  on the same hours scale, rounded up to an even number. End margins keep bars distinct from the
  grid. All three views use the same duration-bar renderer; Calendar and Lunations share the
  rounded hours scale. Compact Year cards show a chronological daily bar profile when their
  height permits, retaining totals and new-moon dates.
- **Moon context.** A quiet glyph and, where space permits, illumination accompany the date.
  New moons are marked on the event's actual site-local civil date. This can differ from the
  evening date of the event-associated night in River or the centered cycle in Lunations.
- **Complete weeks.** Each month keeps seven Sunday-first columns. Adjacent months' dates are
  dimmed and selectable if loaded, without repeating their summaries. Selecting one keeps the
  current month context. Keyboard navigation uses real dates in their own month, so Left from
  October 1 goes directly to September 30 in September, bypassing duplicate placeholder cells.
  Crossing a month boundary preserves the scroll position when the real date is already visible;
  navigation scrolls only as needed to reveal the date and any open night expansion.
  Unloaded neighboring dates show a dash and cannot be selected.
- **Week detail.** Seven nights share a clock axis from their earliest sunset to latest sunrise,
  padded to half hours. Evening is at the top and morning below. The shared sky/Moon renderer
  supplies the same colors and accepted-moonlight treatment as River and Lunations. Time labels
  mark the painted transitions: sunset, twilight levels, sunrise, and the edges between astronomical darkness,
  ordinary moonlight and accepted moonlight. Moon rise/set events outside the dark region receive
  no extra labels. Labels show only the time: the bands already identify the boundaries.
  A label stays on its boundary whenever it fits, with no connector. Crowded labels move apart and
  receive leaders back to their exact boundaries. There are no green interval boundary lines.
  Dense or short weeks can grow enough to keep event labels separate; named events remain in the
  shared night expansion.
- **Year navigation.** Chronological mini calendars cover the shared range. Around now shows
  fourteen months with a year in each heading. Calendar year shows January through December
  in four columns on desktop and two on phones, with the year in the chart header. Month
  choices include usable-hour totals, new-moon dates and daily bars where space allows.
  Each mini calendar is a keyboard and touch button that opens Month. Smaller chart frames
  scroll compact choices to preserve readable captions and touch targets.
- **Shared night expansion.** Selecting a Month or Week date inserts the same horizontal event
  timeline used by River and Lunations after the activated row. Its height is reserved in the
  scrolling sequence, so it covers no dates. Opening it reveals the panel; scrolling can return to
  the overview or continue to later dates. It includes ordered Sun/Moon events, every usable
  window, phase, illumination and threshold/clock-change notes. Activate the date again, use Close
  or Escape to collapse. Enter/Space toggles; Left/Right select neighboring nights and Up/Down move
  a week, carrying the expansion. Native touch swipes do not select a night.
- **Focus and settings.** New-moon focus quiets daily summaries without removing dates. Planning
  controls share River and Lunations' header or phone Plan settings. On small
  screens, the month can scroll vertically to keep summaries readable. The pointer readout previews a
  pointed-at night and otherwise summarizes the selection. Richer seasonal profiles and weekend
  rankings remain in River.
- **Sharing.** Month/Week, the selected evening date and expansion are reproducible through the
  existing site-optional links. Incoming plan settings become the current saved choices. Earlier links with
  month-presentation or orientation fields remain readable; new links omit the retired presentation
  choice. Unrelated stored preferences are preserved.
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
  offset in the preceding/following cycle. An open detail follows selection. The quiet pointer readout
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

### Dark Weekends

A fourth view compares the best Fri–Sat and Thu–Sun trips side by side for every new moon in the
loaded range. The list opens near tonight when the range contains the current date. It shares the
site, range and Moon settings, and its results are independent of new-moon focus. Each row shows
the exact local new moon, cycle coverage, astronomical darkness, and usable dark.
Disclosures show every eligible weekend, the gain from adding Thursday and Sunday on the same
weekend, and the separate usable windows on each night. An amber badge marks the best dates for
each trip length, and the summary calls out when the preferred weekend changes. Trip durations
use green bars, matching usable duration elsewhere. Comparison rows and cards keep a compact
width on desktop. The bounded 56rem panel is centered on wide screens and remains fluid on phones,
with comparisons scrolling inside it. On phones the cycle heading stacks above the two side-by-side picks.
Chart buttons on a pick or an expanded weekend open the first night of the chosen trip. River
and Calendar open Month from Year for the jump without saving a different zoom preference.
Lunations retains its focus window and opens the night detail even if the date falls outside it.

### Shared pieces

- **Viewport.** Every view fits the available dynamic screen height, with safe-area padding
  around phone cutouts and the home indicator. Nights, lunar cycles and weekend comparisons
  scroll inside the remaining panel space; rotating the phone does not force a second page
  scrollbar or leave a fixed-height chart below the screen.
- **Header.** The observing site sits beneath a distinct but restrained 16 px, bold app title. A shared
  live-status row below the controls gives the next event a larger countdown with tabular digits,
  an explicit phase label and reserved row height. It stays in the same place across all four
  planner views, separate from the browsed period in the chart header. The full IANA zone remains
  available to assistive technology, on clock hover and in the site manager. The picker uses
  site names; coordinates and elevation stay in the manager and the picker's hover description.
  Identical favorite names retain coordinate descriptions to distinguish them.
  River, Lunations, Calendar and Dark Weekends share one switcher in that order. River remains the
  first-visit default, while saved choices and shared links retain their view.
  The active view has an accent-tinted fill, an inset border and a stronger bottom edge so it
  remains distinct in Light, Dark and Observing without changing control size. Secondary zoom
  and focus selectors retain their quieter neutral treatment.
  On wide displays, site, views, loaded Range and Tonight, New-moon focus and the two Moon
  thresholds share one horizontal band. Related controls stay together and wrap as groups when
  space runs out. The site block has a bounded width so it cannot push every other control away.
  Desktop control faces share a 30 px height and top edge; small labels align with the app title,
  with a left-aligned status row beginning directly under the site picker: current site time and
  zone, “Usable dark now” when active, then the prominent next-event countdown and any later event
  in smaller text. Middle dots separate the
  neighboring segments; they stay grouped rather than spreading across the header. Shared events
  use one countdown, omitting a redundant usable-start segment. Intermediate desktop widths reserve
  two lines for wrapping.
  The prominent countdown follows the closest known event: the next solar phase (civil, nautical
  or astronomical twilight, astronomical darkness, or daylight), usable dark starting, or usable dark
  ending. Ordering uses exact instants, not rounded display values. It switches targets at each boundary;
  when events differ, the later event stays secondary. It shows elapsed
  minutes as “m”, matching the chart durations and calendar export, and adds hours/days for longer waits. In the final five minutes it switches to minutes
  and seconds (for example, “4m 59s”). Both solar and usable countdowns round up, so they never
  show zero before a boundary. Seconds indicate time to a calculated event, not second-level
  observational accuracy. Updates use the actual instant, including on returning to the page;
  seconds update only the status DOM, without repainting charts or live screen-reader announcements.
  Usable dark follows the same windows and Moon settings as the charts. Before a window, its
  secondary readout says “usable dark in …”; when that start is closest, the primary reads
  “1h 46m until usable dark”. Inside a window, “Usable dark now” has a small green marker.
  A separate ending reads “14m until usable dark ends” when it becomes the next event.
  The usable countdown stops at the end of the current observing night's astronomical darkness;
  it never skips ahead to another night's window. Without a remaining usable window, only the
  solar countdown is shown; the usable segment and its separator are empty.
  Shared starts read “14m until astronomical darkness + usable dark.” When a usable window ends
  at dawn, the readout combines them as “Usable dark now · 2h until astronomical twilight.”
  Combining requires identical event instants, not merely the same rounded minute. Adjacent
  usable windows are joined across observing-date boundaries, so noon alone cannot end a window.
  Phones reserve one compact row for the labeled next-event countdown, using “m” for minutes. The
  countdown and its chevron form a single **Live details** button aligned with the site picker’s
  left edge. Its digits start at that edge, without a padded duration column. Activating it opens a
  keyboard- and touch-operable disclosure with the site-local date/time, UTC offset, full IANA
  zone and complete solar/usable status, including combined wording when their instants coincide.
  Escape or an outside tap closes it; opening it does not change the chart height. The primary
  countdown keeps the complete event label, and the selected site remains visible above it.
  The row retains its height through loading, phase changes and empty usable status.
  The view tabs and More button align with the
  input faces rather than the vertical center of their labeled groups.
  An upper-right, unboxed **More options (⋯)** button with vertically centered dots opens a
  Bootstrap dropdown with sharing, calendar export, Browser data and theme controls. System, Light, Dark and Observing
  appear together with a checkmark on the current preference. Choosing a theme dismisses the menu and returns focus
  to More. The “Theme” heading stays unchanged. Arrow keys navigate items, Escape dismisses
  the menu, and clicking outside closes it. Menu keys do not navigate the chart. Share returns
  focus to More when closed.
  The Range date button opens a picker. Around now loads fourteen months starting with the
  previous month at the site. Calendar year takes a year from 1900 through 2100 and loads
  January through December on Show year. The arrows move either span by a year. A range change
  keeps the selected night if present, otherwise it selects tonight or the first night. Tonight jumps to the site's
  current observing night and restores Around now if the selected span excludes it.
  Tonight uses a neutral button treatment, and tonight and now are marked in the chart.
  Browsing months and cycles uses scrolling,
  with the browsed period and view-specific Year/Month/Week controls inside the chart header.
  On phones, site, views, Tonight and the labeled live countdown stay visible. **Plan settings** shows the
  loaded date range and opens a scrollable dialog containing Range, new-moon focus and both
  Moon thresholds. The dialog reuses the desktop controls, applies edits immediately, traps
  keyboard focus, and returns focus to its trigger on Done or Escape. An open Range picker
  closes before the dialog when Escape is pressed. Rotating between phone orientations keeps
  the dialog and its inputs intact; crossing to desktop restores the inline controls and focus.
  Portrait stacks the shared header; short landscape screens place the view tabs beside the
  site and Plan settings/Tonight beside the status. This compact arrangement applies through
  700 px wide, and through 1100 px wide when the viewport is at most 500 px tall.
  Phone site/view controls have 32 px faces, with tight group spacing; Plan settings and Tonight
  use 36 px, and dialog controls retain 44 px. They fit at 320 px without horizontal page
  scrolling. Docs opens its own reading shell.
- **Chart toolbar and legend.** The panel header keeps zoom controls and the browsed period;
  the active view is already identified by the shared navigation. Its view heading remains
  available to assistive technology. Explanatory sentences belong in How it works and chart help.
  River and Calendar start Year/Month at the same position with identical control sizes, and
  Calendar adds Week. Lunations shows its browsed period without an empty zoom control. Desktop
  uses one row; phone portrait puts the period below the zoom controls, with Legend alongside
  the controls. Landscape keeps the toolbar in one row to preserve chart space.
  All views share padding, spacing and 32 px phone toolbar controls.
  The compact inline key groups the five named sky stages and uses short Moonlight, Accepted
  moonlight and Usable dark labels. Accepted moonlight appears only with relaxed planning settings.
  Calendar Month/Year already label their duration scale and omit the sky key; Week keeps the sky
  and Moon keys. New-moon annotations label themselves in the charts and have no legend entry.
  A labeled Legend button opens the full explanations in a Bootstrap dropdown with dialog semantics. The same key moves
  into that panel, preserving its colors, entries and theme treatment. At 1100 px and below,
  only the button is shown until the key is opened. Escape and Close return focus to Legend;
  clicking outside dismisses it. Page Up/Down scroll the key without navigating the chart. The
  dropdown fits the available viewport, including short phones, and does not resize the chart or
  change the browsed position. Full-size layouts retain the compact key inline when it closes.
- **Sharing.** More offers Share site and Share plan. A site invitation uses a validated
  `#npa=2` fragment containing just the site. It opens in Around now with the recipient's own
  settings, automatically saves a new site at the top of the list, and offers Undo in a dismissible twelve-second
  notice. Its countdown pauses during calculations, in hidden tabs or inactive windows, and
  while the notice has keyboard focus or pointer hover. Returning to the ready, active planner
  resumes the remaining time. Share site also offers an unchecked **Welcome the recipient**
  option, adding `welcome=1` to the invitation fragment. For a new site, a short welcome dialog
  replaces the addition notice, introduces exploring dark skies at the named site, and offers
  **Explore the skies**. A quieter save explanation and Undo remain inside the dialog. Close,
  Escape and clicking outside also enter the planner. Already-saved sites skip the welcome.
  Unavailable storage is explained in the dialog without claiming a save or offering Undo.
  Successful invitations leave an
  ordinary URL so reload cannot repeat an addition after Undo. Existing locations are reused
  within 0.00001° coordinate rounding, preserving the saved name, metadata and position. A new site saved from a plan also goes first. Undo removes
  only the unchanged addition and restores saved activation only if that favorite is still active.
  It preserves subsequent edits and selections, including work in another tab.
  Plan links retain the loaded date span, view/zooms/orientation, focus, thresholds, selected
  evening date and expansion in the `#npa=1` format. The `start` field fixes the first loaded
  month. Calendar year plans add `range=year` and start in January. The original fourteen-month
  links use `start` alone to set the dates. Plan settings become ordinary saved preferences.
  A site is omitted by default. Explicit inclusion previews its name, coordinates, zone and
  optional elevation and explains who can read those details in links and browser history.
  A new plan site is used immediately with Save site and Dismiss. Dismiss keeps the plan open.
  Matching locations create no duplicate or save offer. If the link has different zone/elevation
  details, those apply to the open plan while the existing favorite retains its saved values.
  Worked examples use an explicit `preview=1` plan, keeping their settings separate from the
  reader's preferences. Theme stays personal. Invalid links have dismissible feedback, and
  unavailable storage leaves changes temporary. Copy failure selects the link for manual copying.
  Earlier encoded JSON plans and calendar-export links still open. All link data remains in the
  fragment, with no link-shortening service or server-stored lookup.
- **Calendar export.** More opens a date and event preview scoped to the loaded range, defaulting
  to the next 30 observing dates when available. The browser downloads one iCalendar snapshot.
  New moons use the site's civil date and include the associated observing night's details when
  it is loaded, even if its evening falls on the preceding date. Observing nights use their
  evening date and a strict threshold on summed elapsed usable time. Weekend entries use the
  Dark Weekends Fri–Sat winner and require both dates to fit the export. Entries are all day,
  request free availability and carry no Atlas alarms. Shared-plan links restore the loaded
  range, selected night and Moon settings.
  Including the site in those links is an explicit choice. Atlas sends no calendar data over
  the network. The import screen explains how to use a separate destination calendar and
  replace its events before a repeat import.
- **Docs.** A visible Docs link in the main header opens a reading shell with the app identity,
  Back to planner and the existing theme menu. The site picker, current clock, view switcher,
  planning controls and shared-plan notice stay with the planner. Six bundled pages provide an
  Overview, FAQ, Using the planner, How it works, Privacy, and Licenses and credits. A persistent desktop
  hierarchy exposes sections of the current guide; phones use a Contents disclosure. Page and
  section links use `?docs=…#section`, support reload and browser history, and never carry the
  observing site. Existing guide section anchors and legacy Notes links remain readable.
  The planner remains mounted: closing Docs restores the site, open shared plan, settings,
  selection, expansion and browsed position without saving a Docs view preference. Direct Docs
  visits defer the full range calculation until returning to the planner. Once More shows
  **Ready to reopen offline**, the planner and direct Docs links can reopen offline in the same
  browser. The browser keeps the app files separately from saved sites and preferences.
  The practical guide pairs two computed Seattle/Paramount Park nights: September 11, 2026,
  with one complete moon-free window, and September 6 with a rising crescent. A local example
  control compares strict, 5° and ignored-under-20% choices without changing personal settings.
  SVG strips use the same solar intervals, disjoint moonlight bands, opacity gradients and palette tokens as the
  charts. Deliberate example links open a temporary public-starter plan in another tab. Technical
  chapters retain upper-edge/center conventions, accuracy provenance, polar/DST and split-window
  explanations. Complete offline code/data notices and the matching boundary dataset stay in
  Licenses and credits. That page has direct section links for AGPL-3.0-only code, CC BY-SA 4.0
  content, CC0 numerical results, and third-party credits. Full legal texts are bundled for
  offline reading. Privacy has its own page and keeps its existing links. The sky ramp uses
  `inkOn` in every palette.
- **Night details.** All three charts share ordered event annotations on the same clock axis,
  with illumination, phase, individual usable-window durations and threshold/clock-change notes.
  Calendar reserves the panel after its selected row; Lunations places it beneath its cycle. River
  annotates its selected row directly. On pointer devices, a fixed readout previews nights without changing selection
  and lists every separate usable window.
- **Planning thresholds.** _Moon’s upper edge above_ (0°–15°) allows for a tree line or hills.
  The Moon counts as up while any part of its refracted disk
  clears that height; Moonrise and Moonset use the upper edge at the natural horizon.
  _Ignore a moon under_ (10–30% lit) is for people who don't mind a thin crescent. Both change
  every number and the weekend picks, not just the drawing.
- **Site.** A native dropdown switches directly between named local favorites. **Manage sites…**
  follows a native visual separator and opens an ordered management list. Each row shows a name,
  coordinates, zone and optional elevation in compact, fixed-height desktop rows. A fixed action
  strip contains Use, a pencil for Edit, overlapping squares for Duplicate, up/down arrows and a
  trash can for Remove. Every icon has an accessible label and tooltip. The currently used site
  shows a checkmark in the Use slot, keeping action positions and row height stable. Long names
  and metadata truncate with full text in their tooltips. Reordering saves immediately, keeps focus on the moved control and never
  switches the observing site, starts a zone lookup or resets the edit draft. The list and picker
  use the same order. New manually added or shared sites go first; duplicates go immediately after
  their source (or first if the source was removed while editing). Existing shared locations stay
  in place. No separate pinned/favorite category or drag gesture is needed.
  The name,
  coordinates, IANA zone and optional elevation are saved together. Unsaved plan sites remain
  visible as the current selection.
  A fresh browser starts with Seattle's Paramount Park selected, plus Edinburgh's Royal
  Observatory, Sydney's Linden Observatory, Chile's Vera C. Rubin Observatory, Quito's
  Astronomical Observatory and Svalbard's Kjell Henriksen Observatory. These are editable starter
  favorites spanning northern and southern seasons, near-equatorial nights and polar extremes.
  The versioned personal-data namespace starts with fresh defaults; earlier per-setting storage is
  ignored and left untouched. A separate starter revision records applied additions. Future starter
  revisions add only their own new entries, preserving earlier removals and edits. Restoring missing
  starters appends missing examples in **More → Browser data…**, preserving existing order and selection.
  All latitudes from −90° to +90° are accepted. When sunrise or sunset is absent, every view uses
  a noon-to-noon clock axis. Solar shading follows intervals below each threshold, including stages
  that continue throughout the period and twilight without a sunrise. Clipped noon boundaries do
  not invent rise/set events. The same intervals drive sky-color labels, astronomical darkness totals and
  moonlight in every view. Calendar Week retains the full period for these cases too.
  Edit opens an independent form beside the list on desktop and in place of it on phones.
  Save changes returns to the list without activating another site; saving the currently used
  saved site updates its open plan. Save & use applies the complete site and closes the manager.
  Done closes management; Cancel edit returns to the list. Leaving a changed draft, including
  Close or Escape, asks whether to discard it. Already saved moves remain saved. Clicking the
  backdrop keeps the manager open. Cross-tab edits refresh keyed rows while preserving the form;
  a changed or removed draft target offers Reload saved site or Keep as a new site. The latter
  preserves the entered fields and requires an explicit save. Unsaved current sites have their
  own Save current site action, outside the ordered saved list.
  Removing an active favorite leaves the current plan open until another site is used.
  One field accepts decimal latitude/longitude or documented full coordinate-bearing Google Maps
  search links, parsed entirely locally with a coordinate preview. Camera-only, ambiguous and
  short links receive guidance instead of a guessed location; imported URLs are not retained.
  A same-origin worker infers the zone from bundled boundary data, including offline. A visible
  editable zone supports manual overrides; clearing it infers the zone when saving. Ambiguous
  results require a choice. Validation errors sit beside their fields, mark the invalid control
  and focus it on Save. Coordinates parsed from a Maps link appear directly below its input;
  decimal entries do not repeat. Saved-site names use coordinates only to distinguish duplicate
  names. The main site picker retains native selection and keyboard behavior; its separator is
  visual only and Manage sites remains explicitly named. The guide credits the ODbL data and links its matching dataset and full
  notices alongside the other credits.
  Unknown/damaged personal data is left untouched, and unavailable storage is explained.
  Blank elevation uses sea level; existing saved sites keep their coordinates.
  Elevation adjusts observer position and idealized refraction while assuming
  a level horizon, with no terrain lookup. The default is Seattle. In the shared header, a reserved
  readout (with a disclosure on phones) shows the site's current local date/time, abbreviation, UTC offset and IANA zone,
  followed by the solar and usable-dark status. It updates at clock/countdown minutes, seconds during each countdown’s final five minutes, solar
  and usable-window boundaries, on returning to the page and immediately on site or Moon-setting
  changes. The selected night and browsed range do not affect it. Calculations stay in the
  browser. The status reads the chart's computed nights directly and retains current nights while
  another year is browsed. Missing months use the same calculation and cache path as the views.

  Starter elevations are approximate metres above sea level, looked up during development and
  bundled with the sites; there is no runtime elevation request:

  | Starter site                          | Elevation | Source                                                                                                                                                                                              |
  | ------------------------------------- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Seattle, Paramount Park               |     122 m | [USGS Elevation Point Query Service](https://epqs.nationalmap.gov/v1/json?x=-122.31984159452988&y=47.74028262343255&units=Meters&wkid=4326&includeDate=false), 122.16 m at the supplied coordinates |
  | Edinburgh, Royal Observatory          |     134 m | [Nature's description of the observatory](https://www.nature.com/articles/053605e0), about 440 ft at its centre                                                                                     |
  | Sydney, Linden Observatory            |     574 m | [Bérard et al. (2017), Table 2](https://sci2s.ugr.es/sites/default/files/ficherosPublicaciones/2418_Berard_2017_AJ_154_144.pdf), observing-station altitude                                         |
  | Chile, Vera C. Rubin Observatory      |   2,647 m | [Rubin's site description](https://rubinobservatory.org/for-scientists/rubin-101)                                                                                                                   |
  | Quito, Astronomical Observatory       |   2,823 m | [UNESCO–IAU Portal to the Heritage of Astronomy](https://web.astronomicalheritage.net/index.php/show-entity?identity=113&idsubentity=1), also the source for its coordinates                        |
  | Svalbard, Kjell Henriksen Observatory |     520 m | [KHO's practical information](https://kho.unis.no/Information.html), also the source for its coordinates                                                                                            |

- **Keyboard.** ←/→ previous or next night, ↑/↓ a week, T tonight, 1–4 open River, Lunations,
  Calendar and Docs respectively, 5 opens Dark Weekends, Esc
  collapses an expanded River/Lunations night or Calendar expansion. Enter/Space toggles the selected
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

### Standard UI components

Bootstrap supplies the common buttons, button groups, forms, dropdowns and modals. Its CSS and
the Dropdown/Modal JavaScript modules are bundled with Vite; Popper positions dropdowns. Atlas
maps its Light, Dark and Observing palette tokens into Bootstrap variables, while the night
model, canvas/SVG charts and chart-specific navigation remain independent of the component library.
This keeps ordinary interaction behavior in a maintained library and preserves the sky encodings.
Keycaps pair their foreground with their background. Checkbox marks contrast with the accent
in every palette; forced-colors mode uses the browser's native checkbox rendering.

Theme preferences form one labeled group inside More instead of a nested flyout. Bootstrap has
no nested dropdown component; flattening four choices avoids maintaining another submenu.
Exactly one preference has a checkmark. Selecting any option, including the current one,
applies it, dismisses the menu and returns focus to More. The heading stays “Theme”.
System remains checked while its effective Bootstrap light/dark mode follows the device.

Site management, sharing and Browser data use scrollable Bootstrap modals. Browser data opened
from More closes with Done and restores focus to More. Import and export live only in Browser data
because they include all sites and preferences. The manager's footer points to that location,
without a second entry point or a transition between dialogs. Export downloads the current list
without including an open edit draft. Native fields retain local
validation, offline IANA lookup and browser-only persistence.

### View and model choices

Rationale that isn't obvious from the result:

- **Moonlight wash.** Phase and altitude make the warm-grey wash more informative than a constant
  illuminated-fraction wash. In #8's comparison, the first physical-to-display mapping made an
  18.3%-lit crescent and a low 54.2%-lit quarter Moon too dim. The selected mapping restores the
  0.17 floor and lifts faint values with a square root, while retaining the 0.57 ceiling. Moon-up
  remains a recognizable visual state and altitude adds a subtle gradient. Fixed reference
  conditions keep this display self-contained; no atmospheric inputs or new usable-hour rules
  follow from the apparent brightness.
- **Marking planning windows.** A thin green edge was hard to interpret when planning thresholds
  accepted time beyond strictly moon-free darkness. Accepted moonlit time now uses a green wash
  instead of hatching. Its opacity follows the same phase-and-altitude curve as ordinary
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

## Browser storage

`npa:personal` is the single authoritative localStorage document for favorite sites, the active
favorite ID (or a complete current unsaved site), and optional planning/view/theme preferences.
The sites array itself defines display order; reordering requires no schema migration or extra
rank field. Moves operate by stable ID against the latest locked list. Concurrent operations
are applied in lock order, retaining unrelated records and their edits.
Schema version 1 starts fresh and does not import the earlier individual keys. Missing preferences
retain app/responsive defaults; an explicit focus of zero means Off. The inline theme bootstrap
reads this same document before CSS paints. Share-link version 1 remains independent.

All writes use a short Web Lock, reread/validate the latest document, apply a specific edit and
increment its revision. Cross-tab storage events refresh site pickers without switching the open
plan or discarding an editor draft. Saving/removing a site checks the draft's original record;
conflicts preserve the draft. Unavailable locking/storage or failed writes allow explicit tab-only
changes. Unsupported/corrupt records are preserved and never overwritten with fallback defaults.

Schema migration steps advance one version at a time in memory, validate the final document, save
the exact original to `npa:personal:backup`, then atomically replace the main record. The initial
schema has no historical migrations. Future releases retain all released schema readers/migrations;
older writers must recheck the schema before each edit and use temporary state if it is newer.
There is no automatic downgrade. Starter revisions are separate from schema versions.

**More → Browser data…** separates Backup and restore, Recovery copy and Maintenance.
Export downloads the current personal document without calculations or an unsaved edit draft;
when saving is unavailable this includes the explicit tab-only state, with an explanation.
Import is validated and reviewed before explicit replacement of all sites, order, saved selection
and preferences. A changed current document blocks a stale import preview, including intervening
reordering. This is a replacement, not a merge or sites-only import.
Import, preference reset and format migration preserve one previous saved document at
`npa:personal:backup`. Download recovery copy has a visible empty/unavailable state. Ordinary
site edits and moves do not produce history; the next qualifying operation replaces the copy,
and clearing browser data removes it. The downloaded file can be imported through the same
validated replacement flow. Preference reset keeps sites and order, and starter restoration
appends missing records while keeping existing edits and selection. Original stored data can
be downloaded separately when the app cannot safely save, including unreadable/newer formats. These controls work without reloading the page. Browser-cleared
storage is outside app migration guarantees; a deliberate export supplies an external backup and
supports moving between browsers or origins. Data and coordinates never enter diagnostic logs.

Computed results live separately in the disposable IndexedDB database `npa:computed`. Complete
site-month blocks reuse every planning/display variation for matching computational site inputs,
and share overlapping months between ranges. The cache is bounded to 32 MiB of
estimated payload and 512 monthly entries, with least-recently-used eviction. Engine/codec
fingerprints invalidate calculations automatically while personal schema migrations preserve user
data. Development uses the same cache; calculation/codec and dependency-lock edits restart Vite
with a fresh fingerprint while UI/style hot reloads preserve compatible calculations. Unsupported,
missing or damaged cache entries compute in a same-origin background worker, leaving the page
available for interaction. The chart and live status share in-flight nights; changing sites or
ranges abandons obsolete requests after the outstanding job (one night or a solar-preparation month).
Worker failures resume the existing main-thread slices with completed nights retained.

The tab's shared memory cache also allows 32 MiB of estimated base calculation payload, up to
512 site-months, so browsing several years can stay in memory. Active range requests retain their
cache hits while disk reads and memory eviction run; a previously cached month cannot disappear
mid-request and unexpectedly require full-range computation. These budgets describe cached payload,
not total JavaScript heap or the separately retained displayed range.

River becomes usable one month at a time. A solar-only pass first establishes the exact full-range
clock axis and date/quarter alignment; its calculations are reused when completing each night.
The selected month (or tonight's month) loads first. Remaining months fill outward, reprioritized
around the browsed month after each completed block. Every date already has its final row height,
including new-moon focus, so incoming data and completion preserve scrolling and selection.
Uncomputed rows use the neutral separator color, “Calculating…” labels and ellipses for duration;
they never use the zero-dark dash or offer fabricated night details. They remain navigable, and
completed nights support selection, expansion and threshold changes during loading. The header
shows completed months beside the period label without covering the chart or adding a layout row.
During loading, duration bars use a fixed 24-hour ceiling; after completion they use the normal
range maximum. The time axis, row heights and date alignment do not change.

Calendar, Lunations, Dark Weekends, sharing and calendar export wait for the full range, keeping
incomplete totals and recommendations out of those views. The same calculations feed every view;
progressive rendering does not change the numerical night model.

**Browser data…** shows approximate cache size/count and a separate **Clear computed cache** action.
Personal exports omit calculations, and clearing calculations preserves the personal document,
preferences and recovery copy. Unsaved shared sites and tab-only edits do not persist private
calculation blocks. The privacy boundary is the browser origin for both kinds of storage; no new
third-party requests or services are introduced. The worker ships with the offline app.
