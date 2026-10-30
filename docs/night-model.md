# Night model

How the site computes a night. The views depend on this contract; change it deliberately, and
update this document in the same change as the code. The code lives in `src/model/`: `time.ts`
(local clock time in a zone), `night.ts` (one night), `moon.ts` (upper-limb crossings), `refraction.ts` (air-density
corrections), and `range.ts`
(the loaded range and the structures the views share). It has no DOM, so its unit tests run in Node.

## Site and time

- A site is a name, latitude, longitude (east positive), IANA time zone, and optional elevation
  in metres above sea level. The site editor accepts −500 m to 10,000 m. Blank elevation,
  including sites saved before this field existed, uses 0 m without altering the saved coordinates.
- Elevation is entered manually and stays in browser localStorage with the site. There is no
  elevation lookup, terrain download or external runtime request.
- The observer's position includes the site's elevation. The horizon remains a level horizontal
  plane: elevation is never treated as height above surrounding terrain, and no horizon dip,
  mountain profile or terrain obstruction is inferred.
- Displayed times are the site's local clock time from its IANA zone, including daylight saving
  time. The viewer's own time zone plays no part.
- Timelines place times at wall-clock hours after local noon of the night's date. The range axis
  runs from the loaded range's earliest sunset to its latest sunrise, padded by about 20 minutes
  and rounded out to the half hour. Calendar Week fits the same clock coordinates to the seven
  displayed nights' sunset/sunrise extent, with half-hour padding. This affects drawing only.

## Observing night

- A night is labeled by the local date of its evening (`YYYY-MM-DD`) and runs from local noon to
  the next local noon.
- "Tonight" is today's date after local noon, and yesterday's before it.
- The default loaded range is 14 whole months starting with the month before the current one. The Range
  control shifts it by a year. A shared plan can fix the first month explicitly so its loaded
  dates remain reproducible when opened later; the Range control still shifts those dates by years.
  Calendar Year loads a January-based 14-month range when needed to include the complete selected
  calendar year. Night calculations and elapsed durations are identical for a given evening date.

## Sun events

Found with Astronomy Engine's `SearchAltitude` for the Sun's center, searching forward 24 hours
from local noon:

| Events                               | Sun altitude                                        |
| ------------------------------------ | --------------------------------------------------- |
| Sunset, sunrise                      | −0.833° at sea level (refraction and semi-diameter) |
| Civil dusk, civil dawn               | −6°                                                 |
| Nautical dusk, nautical dawn         | −12°                                                |
| Astronomical dusk, astronomical dawn | −18°                                                |

At elevation, the sunset/sunrise threshold is `−0.833° + (34/60)° × (1 − density)`.
`density` is the air density relative to sea level from Astronomy Engine's U.S. Standard
Atmosphere (1976), evaluated at the site's elevation. This keeps the nominal solar radius fixed
and scales the refraction term. Twilight remains geometric (−6°/−12°/−18°), with only the
observer-position correction; it receives no refraction or horizon-dip adjustment.

If an event doesn't happen (the Sun never gets that low, or never sets), it is absent, along with
the bands that depend on it. The views label such nights, for example "No true dark".

## True dark

From astronomical dusk to astronomical dawn. Absent when the Sun doesn't reach −18°.

## Moon

- Moonrise and Moonset occur when the **upper edge** of the disk crosses a level horizon,
  viewed from the observing site (topocentric, including lunar parallax). The angular radius
  varies with distance, using Astronomy Engine's 1,738.1 km equatorial lunar radius.
- At the natural horizon (0°), sea-level refraction is the conventional **34 arcminutes**, matching
  USNO and Astronomy Engine's `SearchRiseSet`. At 5°, 10° and 15°, the horizon height is an
  apparent altitude: Astronomy Engine's normal altitude-dependent refraction is applied to
  the upper limb. Refraction is multiplied by the same relative air density used for solar
  events. Elevated thresholds are inverted numerically after scaling, so the selected height
  remains an apparent altitude. Radius and refraction are each included once.
- Crossings use the continuous geometric upper-limb altitude curve. A ten-minute scan, with
  a guard sample on each side of the window, brackets extrema. Golden-section searches locate
  the extrema; their times split the curve into monotone arcs. Bisection then locates each
  threshold crossing to a 50 ms bracket. Finding extrema first preserves grazing rise/set
  pairs that lie entirely between grid samples. A tangent touch alone contributes no moon-up
  interval. These are numerical search tolerances, not claims about atmospheric accuracy.
- All four supported horizon heights are computed once per night. Threshold changes choose
  a precomputed set of intervals; they do not perform more ephemeris searches.
- The event and moon-up search window remains local noon + 2 h through local noon + 22 h.
  Events outside it are absent, even if they occur elsewhere on that civil day. Above-horizon
  intervals are clipped to the window; a clipped edge is not reported as a rise/set event.
- **Chart curves and altitude readouts still show the apparent center**, sampled every ten
  minutes (121 samples). These samples illustrate the curve; they do not determine event times
  or planning intervals. Center-altitude curves use elevation-scaled refraction too. The Moon's
  center can be below 0° when its upper edge first appears.
- Illumination (fraction lit) and phase angle (0° new, 180° full) are taken at local midnight.
  Phase names use illumination thresholds: under 3% is new, over 97% is full, and within
  6 percentage points of half lit is a quarter; the phase angle distinguishes waxing and waning.
- New and full moons come from `SearchMoonQuarter`. Event-to-night assignment and the day offsets
  used by River/Calendar focus retain their existing convention. Lunations uses the actual new-moon
  instants and each night's site-local midnight for ownership, as described below.

## Centered lunar cycles

- Each whole observing night belongs to the new moon closest in elapsed time to its site-local
  midnight. Exact ties belong to the earlier new moon. A cycle's boundaries are the midpoints
  between neighboring new-moon instants; a boundary never splits an observing night.
- The model records each cycle's inclusive first/last evening-date indices before clipping to the
  loaded range. It includes any cycle owning a loaded night, even when its new-moon night lies
  outside that range. Extra adjacent new-moon searches establish the complete bounds of edge
  cycles without changing the existing in-range phase events or their assigned nights.
- **Full cycle** displays all owned loaded nights, exactly once across the entire range. Rows share
  31 positions (−15 through +15) with the new-moon night at zero. A complete cycle normally owns
  29 or 30 nights; unused edge positions are padding. Owned nights beyond the loaded range are
  missing data and mark a partial cycle, distinct from padding outside that cycle.
- **±N focus** crops the owned dates to N nights either side of the new-moon night. The phone's
  initial ±3 choice remains a display default, with explicit saved/shared choices taking precedence.
  Focusing does not reassign ownership or change any night's Sun/Moon events, intervals or duration.

## Moon-free true dark

- True dark minus the intervals when any part of the Moon clears the **moon threshold** (default 0°; 5°, 10°
  and 15° are available).
- With **Ignore a moon under N% lit**, a night whose illumination is below N counts all of its true
  dark as moon-free. The moon is still drawn.
- Pieces shorter than a minute are dropped. The headline number is the sum of the pieces, and the
  window lists them in order.

## Derived numbers

- **Month totals** sum moon-free true dark over the month's nights. "Nights ≥ 4 h" counts nights
  with at least 4 hours of it.
- **Lunation totals** sum it over the displayed owned nights: the full cycle or its ±N crop,
  clipped to the loaded range. Full-cycle totals add up to the total for all loaded nights.
- **Best weekend** (Lunations) is the Friday and Saturday pair in the displayed owned dates with the most
  combined moon-free time. **Dark weekends ahead** makes the same pick within ±7 nights of each
  new moon, from tonight on. A Lunations pair must have both nights in the same cycle and displayed
  window; pairs spanning an ownership boundary are excluded. Ties retain the earlier Friday.
- **Moonlight wash** (display only): opacity 0.17 + 0.40 × illumination^0.8, drawn over true dark
  while the Moon’s upper edge is above the natural horizon (0°), independent of planning thresholds.
  The intersection of that moonlight with accepted planning windows uses a green wash in ordinary
  palettes, or a neutral wash with a dashed cue in Observing, at the same illumination-based opacity.
  The bands do not overlap, and genuinely
  moon-free time stays plain black. This display distinction does not change any computed events, windows or totals.

## Reference verification and accuracy

Verified on October 16, 2026. The tests run offline: external reference values are committed in
`src/model/testdata/usno.json`, separately from the prototype golden files.
The Moon uses standard upper-limb events and refined crossings. The external fixture
remains unchanged; the prototype golden files were intentionally regenerated for the new model.

### USNO tables

The [U.S. Naval Observatory annual tables](https://aa.usno.navy.mil/data/RS_OneYear) provide
sunrise/sunset, moonrise/moonset and all three twilight stages. The fixture records the exact
query URLs, decimal coordinates, UTC dates and verbatim table cells. UTC avoids a fixed-offset
table applying the wrong offset across a clock change. Tests select events inside Atlas's search
windows, then check site-local dates and both offsets on the clock-change nights.

| Site                            | Evening date(s), 2026  | Coverage                                            |
| ------------------------------- | ---------------------- | --------------------------------------------------- |
| Seattle, 47.60621°N 122.34253°W | October 3, 9, 25, 31   | Rising Moon, new/full Moon, fall-back night         |
| Edinburgh, 55.95°N 3.19°W       | June 20                | No nautical/astronomical dusk or dawn; no true dark |
| Sydney, 33.87°S 151.21°E        | October 3; December 21 | Spring-forward night; southern summer solstice      |

All **52 available solar events** agree within **29.6 seconds** of the minute-rounded USNO
values; the four absent twilight events agree too. Tests allow 60 seconds to accommodate table
rounding and small ephemeris/convention differences. The existing independent low-precision
solar model still provides the tighter 30-second wiring check across seven site/date cases.

Moonrise and Moonset use the same upper-limb definition as
[USNO](https://aa.usno.navy.mil/faq/RST_defs): a topocentric disk with its variable angular
radius and 34 arcminutes of refraction. Across the **12 available lunar events**, Atlas agrees
with USNO within **34 seconds**, including minute rounding (test allowance: 60 s). The numerical
crossings also agree with Astronomy Engine's independent `SearchRiseSet` search within one
second. This replaces the old apparent-center events, which differed from USNO by roughly
1½–2¼ minutes. Events absent from the sampling window are checked as absent, rather than
matched to a nearby civil day's event.

These are numerical comparisons under a level horizon at sea level. USNO notes that actual
rise/set can vary by a minute or more with refraction, and more at shallow crossing angles.
Neither the fixture tolerances nor the calculations predict local terrain or weather effects.

### Crossing audit

`sampling.test.ts` checks **all 365 nights of 2026 at all three reference sites**, at 0°, 5°, 10° and 15°.
It independently evaluates the geometric upper-limb ephemeris at one-minute intervals, applies
refraction, finds crossing brackets, and bisects them. Every crossing found by this scan appears
in Atlas, with **less than one second** of timing difference at every threshold. This isolates
numerical search error; it is not an independent lunar ephemeris.

The former ten-minute linear interpolation could shift grazing boundaries by **129 seconds**
and shorten a moon-up interval by about **4 minutes 17 seconds** (Edinburgh, March 11, 2026,
5° center threshold). Production event times no longer depend on that interpolation. The
full-year audit includes that date and the December 13, 15° grazing case. Synthetic peak and
trough tests additionally verify two-second rise/set and set/rise pairs hidden between grid
samples, including near a window edge, as well as a tangent touch and all-up/all-down windows.
The one-minute audit alone cannot rule out every sub-minute event; the extrema tests exercise
that case directly. The search assumes the smooth lunar altitude curve has at most one extremum
in a twenty-minute bracket, within the planner's supported latitude range (−65° to +65°).

### Elevation checks and limits

The sea-level USNO fixture is unchanged. Elevation tests compare solar and lunar rise/set at
−400 m, 2,000 m and 4,500 m with Astronomy Engine's level-horizon `SearchRiseSet` path, whose
height-above-ground parameter is left at zero. Lunar events agree within one second; solar
events allow ten seconds because Atlas uses a fixed nominal solar radius and the library
varies it with distance. These are convention/wiring checks using the same ephemeris, not
independent elevated-site tables.

The full-year crossing audit also covers Seattle's coordinates at 2,000 m, with the same
one-second tolerance at all four Moon thresholds. Additional checks cover the scaled refraction
at elevated Moon horizons, chart curves, and inverse refraction. Browser tests cover persistence,
blank/negative/invalid elevation, reset, and sites saved without elevation.

For Seattle's coordinates on October 3, 2026, changing 0 m to 2,000 m shifts horizon events by
roughly 36 s for the Sun and 49 s for the Moon, while astronomical dusk/dawn move by less than a
second. These are model examples, not a prediction that elevation always has that effect.
Air density is estimated from a standard atmosphere; actual temperature, pressure and near-horizon
refraction remain uncertain. An entered elevation does not describe ridges, trees, or a distant
sea horizon. It improves the idealized calculation modestly without claiming terrain accuracy.

### Reference provenance

The USNO fixture records exact query URLs, coordinates, UTC dates and verbatim table cells.
To reproduce it, fetch those URLs and extract the requested UTC dates' month columns without
changing minute rounding or missing-event markers. Never regenerate an external reference
fixture from Atlas's own output. Normal tests need no network access.

### Prototype compatibility and cost

Golden files in `src/model/testdata/` pin every computed number for Seattle, Edinburgh and Sydney
under three threshold settings. They were first captured from the original prototype; the TypeScript
model pins their current values. This deliberate model change updates Moonrise/Moonset,
moon-up and moon-free windows/totals, lunation totals and weekend picks. Sun events, center-altitude
samples, phases, illumination, time zones, range alignment and true-dark intervals are unchanged.
Adding optional elevation preserves these sea-level golden records exactly; elevated sites
have separate tests. The external USNO fixture is not regenerated from Atlas.

Full-cycle ownership adds first/last indices to the golden lunation records. In the three captured
ranges, the existing cycle counts, usable totals and weekend picks remain identical; the restored
dates around full moon contribute no usable time there. Per-night records, solar/lunar event
times, phase assignments and focus offsets are unchanged. Separate ownership tests cover edge
cycles whose new moon lies outside the loaded range, exact ties, leap day and clock changes.

Computing the 14-month range, about 425 nights, took **1.11 s** in a local Node measurement,
versus about half a second before this change. Re-deriving a range after switching thresholds
averaged **0.25 ms** over 100 switches. In addition to 8 sun searches and 242 chart altitude samples per night, the Moon now
requires extrema and crossing refinements at all four horizon heights. The work runs in 24 ms slices
and repeats when the site or range changes. Changing a threshold only re-derives the numbers;
it doesn't recompute positions.
