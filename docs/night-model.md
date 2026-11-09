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
- All latitudes from −90° through +90° are supported, including both poles.
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
  When a horizon event is absent or the below-horizon interval crosses local noon, the range
  uses the full 0–24 h wall-clock axis. Calendar Week uses the full range axis for these cases.

## Observing night

- A night is labeled by the local date of its evening (`YYYY-MM-DD`) and runs from local noon to
  the next local noon.
- "Tonight" is today's date after local noon, and yesterday's before it.
- **Around now** loads 14 whole months starting with the month before the current one at the
  site. **Calendar year** loads the chosen January through December, including February 29 in
  a leap year. December 31 is an evening date and its night ends at local noon on January 1.
  The range arrows shift the same span by a year. Shared plans can fix either span so the dates
  remain reproducible. All views, summaries and exports use the loaded span. Neighboring lunar
  events establish cycle boundaries without adding nights to the span.

## Sun events

Found with Astronomy Engine's `SearchAltitude` for the Sun's center, searching from local noon
to the next local noon (23, 24 or 25 elapsed hours across ordinary clock changes):

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

Missing events remain absent; a clipped noon boundary is never reported as sunrise or sunset.
For each threshold, the Sun's geometric altitude at the start establishes whether it is already
below it. Ordered downward/upward crossings then define **all intervals below that threshold**,
clipped to the observing period. Further crossings are retained on long clock-change days.
The same intervals drive shading and sky-stage readouts in every view. A stage can continue
throughout the period without either boundary event. Polar night can still contain midday
twilight. The views label nights when the Sun never gets below −18° as "No astronomical darkness".

The header's live countdown searches for the next solar crossing after the actual current
instant, independently of the loaded range. It uses these same geometric twilight thresholds
and elevation-adjusted solar horizon. The label names the phase entered: sunset begins civil
twilight, civil dusk begins nautical twilight, nautical dusk begins astronomical twilight,
and astronomical dusk begins astronomical darkness; dawn reverses those stages toward daylight.
Searches cover up to 370 days for polar seasons and narrow to the earliest crossing found.
They start one second beyond now so numerical search tolerance cannot repeat a just-reached event.
Elapsed UTC milliseconds determine the countdown, including across midnight and clock changes.
This does not change any observing-night calculations or their golden records.

## Astronomical darkness

All intervals below −18°, clipped to the noon-to-noon period. Normally this is astronomical
dusk to astronomical dawn; it can also be the entire period, or two pieces when the selected
clock zone puts noon inside astronomical darkness. The total sums elapsed time across every piece, including
23/25-hour periods. Adjacent observing periods meet at noon without double counting. `td` and
`tdH` retain the first interval for existing callers; `sunBelow.astronomical` contains every
interval and drives all rendering, totals, moonlight and usable-window calculations.

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
- The ordinary event and moon-up search window is local noon + 2 h through local noon + 22 h.
  If darkness below the Sun's horizon extends outside it, the window expands to cover that
  whole interval, rounded outward to ten-minute sample boundaries. When sunrise or sunset is
  absent, it covers the complete noon-to-noon period, including clock changes. Events outside the
  search window are absent. Above-horizon intervals are clipped to it; clipped edges are not
  reported as rise/set events.
- **Chart curves and altitude readouts still show the apparent center**, sampled every ten
  minutes (121 samples on ordinary nights, more for extended periods). These samples illustrate the curve; they do not determine event times
  or planning intervals. Center-altitude curves use elevation-scaled refraction too. The Moon's
  center can be below 0° when its upper edge first appears.
- Illumination (fraction lit) and phase/elongation (0° new, 180° full) for labels and planning
  thresholds are taken at local midnight. The display-only wash separately samples the physical
  phase angle (0° full, 180° new) through the night.
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

## Usable dark

- Usable dark is the part of astronomical darkness that meets the Moon settings. By default,
  the Moon’s upper edge must be below the natural horizon. Raising the **Moon threshold** from
  0° to 5°, 10°, or 15° accepts some moonlit time.
- With **Ignore a moon under N% lit**, a night whose illumination is below N counts all of its
  astronomical darkness as usable dark. The Moon is still drawn.
- Pieces shorter than a minute are dropped. The headline number is the sum of the pieces, and the
  window lists them in order.

## Derived numbers

- **Month totals** sum usable dark over the month's nights. "Nights ≥ 4 h" counts nights
  with at least 4 hours of it.
- **Lunation totals** sum it over the displayed owned nights: the full cycle or its ±N crop,
  clipped to the loaded range. Full-cycle totals add up to the total for all loaded nights.
- **Best weekend** (Lunations) is the Friday and Saturday pair in the displayed owned dates with the most
  combined usable dark. A Lunations pair must have both nights in the same cycle and displayed
  window. Ties retain the earlier Friday.
- **Dark Weekends view** ranks complete Fri–Sat and Thu–Sun trips independently by summed
  elapsed usable time under the active Moon settings. A trip belongs to the centered cycle that
  owns its Friday, and all its nights count, including any outside that cycle. Each preset must
  fit in the loaded range. An eligible Fri–Sat can still appear when the extended dates are
  unloaded. Exact ties retain the earlier Friday and zero usable hours never win. The view
  includes every new moon whose site-local civil date falls in the loaded range. Each cycle's
  totals and candidates use its loaded dates, including past dates.
  Compare the two best picks to see whether the dates change. The gain on an individual weekend
  compares its two presets. All sums and differences precede display rounding.

## Moonlight wash (display only)

`moonlight.ts` implements the fixed-reference zenith moonlight equations from
[Krisciunas & Schaefer (1991), equations 15, 20 and 21](https://articles.adsabs.harvard.edu/pdf/1991PASP..103.1033K).
This is original code implementing the published equations. It is an illustrative brightness
cue, not a calibrated prediction of the site's sky or a criterion for usable hours.

With angles in degrees, physical phase angle `a` is **0° full, 180° new**, from Astronomy Engine's
`Illumination(...).phase_angle`; it is not the midnight `Night.phase` elongation. Use geometric
topocentric Moon-center altitude `h`, with fixed V-band extinction `k = 0.172` mag/airmass:

```text
h = clamp(geometric altitude, 0°, 80°)
rho = 90° − h
X(z) = (1 − 0.96 × sin²(z))^−0.5
I = 10^[−0.4 × (3.84 + 0.026 × a + 4e−9 × a⁴)]
f = 10^5.36 × (1.06 + cos²(rho)) + 10^(6.15 − rho/40)
Bmoon = f × I × 10^[−0.4 × k × X(90° − h)] × (1 − 10^[−0.4 × k])
Bdark = 34.08 × exp(20.7233 − 0.92104 × 21.6)
u = log1p(Bmoon / Bdark) / log1p(Bref / Bdark)
opacity = min(0.57, 0.17 + 0.40 × sqrt(u))
```

Brightness is in nanoLamberts. `Bdark` is a fixed 21.6 V mag/arcsec² reference; `Bref` is `Bmoon`
for a full Moon at 60°. The 0.17 floor and square-root lift keep a crescent or low quarter Moon
visibly distinct from moon-free time. The 0.57 ceiling limits glare. These are display choices
selected in #8; the reference atmosphere/background do not describe an individual observing site.

The lower clamp holds the center at 0° while the refracted upper edge is already up. The upper
clamp holds the entire reference calculation at its 80° boundary, so separation never enters
the excluded region within 10° of the Moon. It gives a continuous, bounded plateau near zenith,
not a model of the aureole. Opposition brightening, lunar-distance corrections, local moisture,
smoke, artificial sky glow, target direction and lunar twilight are not modeled.

`computeNight` stores `moonlight` as a Float32 opacity array on the existing ten-minute altitude
grid, using instantaneous phase and geometric altitude. This covers ordinary, extended and
23/25-hour periods. Rendering interpolates these display samples at the **existing exact** band
boundaries and draws gradients along the site's wall-clock time axis in either orientation.
Repeated clock positions retain the later sample; opacity stops are sorted and bounded. No
ephemeris work occurs during drawing, theme switches or threshold changes. The monthly cache
preserves the array and rejects missing, mismatched or out-of-range samples.

Only the intersection of astronomical darkness and the natural-horizon upper-limb Moon-up
interval receives a wash. Threshold-accepted portions use the same opacity in green (Light/Dark)
or warm neutral with a dashed boundary (Observing), replacing the ordinary tint there. Moon-free
time remains unwashed; there is no wash during twilight or after the upper edge sets. Canvas
views, shared night details and SVG guide examples use the same gradient stops. Neither the
floor nor any other brightness value changes events, usable intervals, totals, rankings or exports.

Published Table 2 values at 30° Moon altitude are checked independently to within their 1 nL
rounding. The reviewed September Seattle examples also pin the brighter mapping: about 23.5–25.4%
opacity for the rising crescent and 32.3–33.5% for the low quarter Moon. Planning golden files
remain unchanged; they do not include these display-only samples.

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

| Site                            | Evening date(s), 2026  | Coverage                                                               |
| ------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| Seattle, 47.60621°N 122.34253°W | October 3, 9, 25, 31   | Rising Moon, new/full Moon, fall-back night                            |
| Edinburgh, 55.95°N 3.19°W       | June 20                | No nautical or astronomical dusk or dawn, and no astronomical darkness |
| Sydney, 33.87°S 151.21°E        | October 3; December 21 | Spring-forward night; southern summer solstice                         |

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
in a twenty-minute bracket. The same numerical audit now also covers all 365 nights at
Kjell Henriksen Observatory (78.148° N, 520 m) and an Antarctic site at 85° S, using the full
extended window when applicable. Both poles and solar stage membership throughout polar seasons
have separate regression checks.

### Polar references

On October 31, 2026, the [USNO sunrise/sunset table for Kjell Henriksen's coordinates](https://aa.usno.navy.mil/calculated/rstt/year?year=2026&task=0&lat=78.148&lon=16.043&label=KHO&tz=0&tz_sign=1)
was checked for March 20–21, June 21 and December 21, 2026. It confirms March 20 sunset
at 17:20 UTC and March 21 sunrise at 04:42 UTC, continuous daylight in June and the Sun
continuously below the horizon in December.
The [astronomical-twilight table](https://aa.usno.navy.mil/calculated/rstt/year?year=2026&task=4&lat=78.148&lon=16.043&label=KHO&tz=0&tz_sign=1)
confirms December 9 dusk at 15:20 UTC / December 10 dawn at 06:18 UTC, and December 21
dusk at 15:13 UTC / December 22 dawn at 06:35 UTC; June has no astronomical darkness.
These minute-rounded sea-level values are pinned offline in `polar.test.ts` with a 60 s tolerance.
The independent solar model also checks the available March, June and December events within
30 s. Continuous astronomical darkness, split intervals, both hemispheres, poles and clock changes are tested
separately. Elevation still uses the idealized atmosphere and level horizon described above.

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
samples, phases, illumination, time zones, range alignment and astronomical darkness intervals are unchanged.
Adding optional elevation preserves these sea-level golden records exactly; elevated sites
have separate tests. The external USNO fixture is not regenerated from Atlas.

Polar support also preserves all three existing golden files exactly: their sites' solar bands
and darkness remain single dusk-to-dawn intervals and their Moon windows remain 20 hours.
The new polar intervals and extended windows have separate tests and references.

Full-cycle ownership adds first/last indices to the golden lunation records. In the three captured
ranges, the existing cycle counts, usable totals and weekend picks remain identical; the restored
dates around full moon contribute no usable time there. Per-night records, solar/lunar event
times, phase assignments and focus offsets are unchanged. Separate ownership tests cover edge
cycles whose new moon lies outside the loaded range, exact ties, leap day and clock changes.

Computing a 426-night range took **1.31 s** for Seattle and **1.10 s** for Kjell Henriksen in a
local Node measurement after the polar extension. Re-deriving a range after switching thresholds
averaged **0.29 ms** and **0.13 ms**, respectively, over 100 switches. Each night has eight initial
Sun searches plus checks for further crossings, and ten-minute chart altitude samples (242 on
ordinary nights, up to 302 for a 25-hour polar period). The Moon requires extrema and crossing
refinements at all four horizon heights. The work runs in 24 ms slices
and repeats when the site or range changes. Changing a threshold only re-derives the numbers;
it doesn't recompute positions.

## Rebuildable monthly cache

Both development and production builds optionally persist complete site-month calculation blocks
in IndexedDB under `npa:computed`. Main-thread computation retains the same 24 ms slices, cancellation checks and
single completed-range publication. Cache hits restore night data; misses alone run the night
calculation. In development, edits to fingerprinted calculation/codec sources or the dependency
lockfile restart Vite and reload the page with a fresh fingerprint. UI/style hot reloads retain
compatible calculations. No worker, progressive rendering or third-party service is involved.

The key combines cache format 2, a build-generated compute fingerprint, exact latitude/longitude,
elevation (missing equals zero), IANA zone and calendar year/month. The fingerprint includes all
non-test model sources, the cache codec and the resolved Astronomy Engine dependency. UI-only
releases retain compatible results. Changed computation/codec generations are never reused;
older entries remain disposable within the same bounded least-recently-used cache. Schema
versions of saved personal data and share links do not determine numerical cache compatibility.

The payload preserves UTC solar events, below-threshold solar intervals, all four refined Moon
threshold windows/crossings, illumination/phase, sample origin and Float32 altitude and moonlight
opacity arrays. Classes, wall-clock fields, range structures and threshold summaries are rebuilt. A block
must contain every expected date and valid finite arrays/intervals. Current browser rules must
still map each local noon, midnight and next noon to the stored instants; otherwise that month
is recomputed. Fresh clock fields use the current time-zone rules. Cache hydration preserves the
existing numerical precision, including polar and 23/25-hour nights.

One block serves every planning threshold, focus, view, zoom and theme. Site names and favorite
IDs are excluded from its key. A rolling 14-month range can reuse 13 previous months; year-shifted
ranges share their overlapping months. The current site's saved status determines eligibility:
unsaved shared sites and tab-only edits do not acquire persistent private calculation records.

The cache has a 32 MiB estimated uncompressed payload budget and a 512-month ceiling. Metadata
tracks approximate bytes and recency separately from calculation payloads. Writes/eviction are
atomic across the two cache stores; least-recently-used blocks leave first. Native IndexedDB
serialization retains typed arrays. Storage failure falls back to computation; a failed write
clears only disposable cache data and retries once, then disables caching for that tab if needed.
Opening/transaction deadlines keep unavailable storage from holding up calculations indefinitely.
New writes are scheduled after the ready range publishes, and a cache-clear epoch prevents an
in-flight calculation from repopulating an explicitly cleared cache.

`Manage sites… → Browser data…` reports cache size/count and clears calculations independently
of sites/preferences and their recovery copy. No cache keys or coordinates enter URLs or logs.
Cache operations require no network access.
