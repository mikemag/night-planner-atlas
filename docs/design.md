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
  from a shared baseline within its row. Its height makes daily differences clear across the week;
  all months share the same maximum bar height and hours scale. Year day cells use horizontal bars
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
  mark the painted transitions: sunset, twilight levels, sunrise, and the edges between true dark,
  ordinary moonlight and accepted moonlight. Moon rise/set events outside the dark region receive
  no extra labels. Labels show only the time: the bands already identify the boundaries.
  A label stays on its boundary whenever it fits, with no connector. Crowded labels move apart and
  receive leaders back to their exact boundaries. There are no green interval boundary lines.
  Dense or short weeks can grow enough to keep event labels separate; named events remain in the
  shared night expansion.
- **Year navigation.** Fourteen mini calendars cover the same loaded range as every other view,
  in chronological order, with larger month headings on wide screens, new-moon dates, usable-hour
  totals and daily bars. Each heading includes its year. Switching periods or views reuses the
  computed nights without changing the range. The shared Range controls shift the loaded range
  by a year; Tonight returns to the site's current observing night. Each entire
  mini calendar is a keyboard/touch month button. Phones and short windows show fourteen compact
  month choices instead of microscopic day grids.
  Desktop fits all fourteen together. Smaller chart frames scroll the choices to preserve readable
  captions and touch targets, including phones where the shared planning header needs more room.
- **Shared night expansion.** Selecting a Month or Week date inserts the same horizontal event
  timeline used by River and Lunations after the activated row. Its height is reserved in the
  scrolling sequence, so it covers no dates. Opening it reveals the panel; scrolling can return to
  the overview or continue to later dates. It includes ordered Sun/Moon events, every usable
  window, phase, illumination and threshold/clock-change notes. Activate the date again, use Close
  or Escape to collapse. Enter/Space toggles; Left/Right select neighboring nights and Up/Down move
  a week, carrying the expansion. Native touch swipes do not select a night.
- **Focus and settings.** New-moon focus quiets daily summaries without removing dates. Planning
  controls appear inline above the chart, using the same row as River and Lunations. On small
  screens, the month can scroll vertically to keep summaries readable. The fixed readout previews a
  pointed-at night and otherwise summarizes the selection. Richer seasonal profiles and weekend
  rankings remain in River.
- **Sharing.** Month/Week, the selected evening date and expansion are reproducible through the
  existing site-optional links. Incoming settings remain temporary until saved. Earlier links with
  month-presentation or orientation fields remain readable; new links omit the retired presentation
  choice. Existing stored preferences are left intact.
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

- **Header.** The observing site is the primary heading, with a quiet app title above and its
  current local date, time, zone abbreviation and UTC offset below. The full IANA zone remains
  available to assistive technology, on clock hover and in the site manager. The picker uses
  site names; coordinates and elevation stay in the manager and the picker's hover description.
  Identical favorite names retain coordinate descriptions to distinguish them.
  River, Lunations and Calendar form one view switcher in that order; River remains the
  first-visit default, while saved choices and shared links retain their view.
  The active view has an accent-tinted fill, an inset border and a stronger bottom edge so it
  remains distinct in Light, Dark and Observing without changing control size. Secondary zoom
  and focus selectors retain their quieter neutral treatment.
  On wide displays, site, views, loaded Range and Tonight, New-moon focus and the two Moon
  thresholds share one horizontal band. Related controls stay together and wrap as groups when
  space runs out. The site block has a bounded width so it cannot push every other control away.
  Desktop control faces share a 30 px height and top edge; small labels align with the app title,
  while the site clock occupies its own line below. The view tabs and More button align with the
  input faces rather than the vertical center of their labeled groups.
  An upper-right, unboxed **More options (⋯)** button with vertically centered dots opens a
  Bootstrap dropdown containing Share plan,
  a Theme group and How it works. System, Light, Dark and Observing appear together with a
  checkmark on the current preference. Choosing a theme dismisses the menu and returns focus
  to More. The “Theme” heading stays unchanged. Arrow keys navigate items, Escape dismisses
  the menu, and clicking outside closes it. Menu keys do not navigate the chart. Share returns
  focus to More when closed; How it works opens independently of the view switcher.
  Range arrows load the same dates a year earlier or later; Tonight loads
  the current range when necessary in every chart view. Tonight uses a neutral button treatment;
  tonight and now are marked in the chart. Browsing months and cycles uses scrolling,
  with the browsed period and view-specific Year/Month/Week controls inside the chart header.
  On phones, the header stacks in the same order across all views, with More options beside the site.
  Site, views, Range, Tonight and focus stay visible. Only the Moon thresholds fold into a
  keyboard-operable disclosure that always summarizes their current values. Desktop exposes
  both thresholds inline. Resizing preserves keyboard access to the threshold controls; changing
  views preserves the disclosure's state. Header controls use larger touch targets and fit at
  320 px without horizontal page scrolling. How it works hides the planning band.
- **Chart toolbar and legend.** The panel header keeps zoom controls and the browsed period;
  the active view is already identified by the shared navigation. Its view heading remains
  available to assistive technology. Explanatory sentences belong in How it works and chart help.
  River and Calendar start Year/Month at the same position with identical control sizes, and
  Calendar adds Week. Lunations shows its browsed period without an empty zoom control. Desktop
  uses one row; phones put the period below the zoom controls, with Legend alongside the controls.
  All views share padding, spacing and touch targets.
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
  Calendar reserves the panel after its selected row; Lunations places it beneath its cycle. River
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
  coordinates, IANA zone and optional elevation are saved together. Shared or unsaved sites remain
  visible as the current selection.
  A fresh browser starts with Seattle's Paramount Park selected, plus Edinburgh's Royal
  Observatory, Sydney's Linden Observatory, Chile's Vera C. Rubin Observatory, Quito's
  Astronomical Observatory and Svalbard's Kjell Henriksen Observatory. These are editable starter
  favorites spanning northern and southern seasons, near-equatorial nights and polar extremes.
  The versioned personal-data namespace starts with fresh defaults; earlier per-setting storage is
  ignored and left untouched. A separate starter revision records applied additions. Future starter
  revisions add only their own new entries, preserving earlier removals and edits. Restoring missing
  starters is a deliberate action in **Browser data…**, reached from the site manager.
  All latitudes from −90° to +90° are accepted. When sunrise or sunset is absent, every view uses
  a noon-to-noon clock axis. Solar shading follows intervals below each threshold, including stages
  that continue throughout the period and twilight without a sunrise. Clipped noon boundaries do
  not invent rise/set events. The same intervals drive sky-color labels, true-dark totals and
  moonlight in every view. Calendar Week retains the full period for these cases too.
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
  Unknown/damaged personal data is left untouched, and unavailable storage is explained.
  Blank elevation uses sea level; existing saved sites keep their coordinates.
  Elevation adjusts observer position and idealized refraction while assuming
  a level horizon, with no terrain lookup. The default is Seattle. Beside the location, a reserved
  readout shows the site's current local date/time, abbreviation, UTC offset and IANA zone.
  It updates each minute, on returning to the page and immediately on site changes; chart
  selection does not affect that clock.

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
  Calendar and How it works respectively, Esc
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

Site management, sharing and Browser data use scrollable Bootstrap modals. Browser data replaces
the site modal while open, then returns to the same draft and its opener. Only one modal and
backdrop exist at a time. Native fields retain the original validation, IANA lookup, conflict
checks, draft/save boundaries and browser-only persistence.
Clicking the site editor's backdrop leaves the draft open; Cancel, Close and Escape dismiss it.

### View and model choices

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

## Browser storage

`npa:personal` is the single authoritative localStorage document for favorite sites, the active
favorite ID (or a complete current unsaved site), and optional planning/view/theme preferences.
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

**Browser data…** exports/imports the versioned personal document without calculations. Import is
validated and reviewed before explicit replacement; a changed revision blocks a stale import.
Import and preference reset preserve the previous saved document for export/recovery. Preference
reset keeps sites, and starter restoration keeps existing records and selection. Unreadable raw
data can be exported for recovery. These controls work without reloading the page. Browser-cleared
storage is outside app migration guarantees; a deliberate export supplies an external backup and
supports moving between browsers or origins. Data and coordinates never enter diagnostic logs.

Computed results live separately in the disposable IndexedDB database `npa:computed`. Complete
site-month blocks reuse every planning/display variation for matching computational site inputs,
and share overlapping months between ranges. The cache is bounded to 32 MiB of
estimated payload and 512 monthly entries, with least-recently-used eviction. Engine/codec
fingerprints invalidate calculations automatically while personal schema migrations preserve user
data. Development uses the same cache; calculation/codec and dependency-lock edits restart Vite
with a fresh fingerprint while UI/style hot reloads preserve compatible calculations. Unsupported,
missing or damaged cache entries compute again in the existing main-thread slices. The completed
range still publishes at once.

**Browser data…** shows approximate cache size/count and a separate **Clear computed cache** action.
Personal exports omit calculations, and clearing calculations preserves the personal document,
preferences and recovery copy. Unsaved shared sites and tab-only edits do not persist private
calculation blocks. The privacy boundary is the browser origin for both kinds of storage; no new
runtime requests or services are introduced.
