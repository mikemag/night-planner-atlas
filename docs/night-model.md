# Night model

How the site computes a night. The views depend on this contract; change it deliberately, and
update this document in the same change as the code. The code lives in `src/model/`: `time.ts`
(local clock time in a zone), `night.ts` (one night), and `range.ts` (the loaded range and the
structures the views share). It has no DOM, so its unit tests run in Node.

## Site and time

- A site is a name, latitude, longitude (east positive) and IANA time zone. Elevation is taken as
  0 m.
- Displayed times are the site's local clock time from its IANA zone, including daylight saving
  time. The viewer's own time zone plays no part.
- The month views place times at wall-clock hours after local noon of the night's date. The axis
  runs from the loaded range's earliest sunset to its latest sunrise, padded by about 20 minutes
  and rounded out to the half hour.

## Observing night

- A night is labeled by the local date of its evening (`YYYY-MM-DD`) and runs from local noon to
  the next local noon.
- "Tonight" is today's date after local noon, and yesterday's before it.
- The loaded range is 14 whole months starting with the month before the current one. The Range
  control shifts it by a year.

## Sun events

Found with Astronomy Engine's `SearchAltitude` for the Sun's center, searching forward 24 hours
from local noon:

| Events                               | Sun altitude                                     |
| ------------------------------------ | ------------------------------------------------ |
| Sunset, sunrise                      | −0.833° (refraction and the Sun's semi-diameter) |
| Civil dusk, civil dawn               | −6°                                              |
| Nautical dusk, nautical dawn         | −12°                                             |
| Astronomical dusk, astronomical dawn | −18°                                             |

If an event doesn't happen (the Sun never gets that low, or never sets), it is absent, along with
the bands that depend on it. The views label such nights, for example "No true dark".

## True dark

From astronomical dusk to astronomical dawn. Absent when the Sun doesn't reach −18°.

## Moon

- Topocentric apparent altitude, with standard refraction, sampled every 10 minutes from local
  noon + 2 h to local noon + 22 h (121 samples).
- Crossings of a threshold altitude are found by linear interpolation between samples, typically
  to within a minute.
- Moonrise and moonset in the UI are crossings of 0° inside that sampling window; outside it they
  are absent.
- Illumination (fraction lit) and phase angle (0° new, 180° full) are taken at local midnight. Phase
  names use the same illumination thresholds as AllSky's planner.
- New and full moons come from `SearchMoonQuarter`. Each night is assigned the nearest new moon
  by local midnight, which drives new-moon focus and the Lunations rows.

## Moon-free true dark

- True dark minus the intervals when the moon is above the **moon threshold** (default 0°; 5°, 10°
  and 15° are available).
- With **Ignore a moon under N% lit**, a night whose illumination is below N counts all of its true
  dark as moon-free. The moon is still drawn.
- Pieces shorter than a minute are dropped. The headline number is the sum of the pieces, and the
  window lists them in order.

## Derived numbers

- **Month totals** sum moon-free true dark over the month's nights. "Nights ≥ 4 h" counts nights
  with at least 4 hours of it.
- **Lunation totals** sum it over the displayed ±N window.
- **Best weekend** (Lunations) is the Friday and Saturday pair in the window with the most
  combined moon-free time. **Dark weekends ahead** makes the same pick within ±7 nights of each
  new moon, from tonight on.
- **Moonlight wash** (display only): opacity 0.17 + 0.40 × illumination^0.8, drawn over true dark.

## Accuracy and cost

- Sun events come from Astronomy Engine's root search, far more precise than a minute. Real sunsets
  vary by a minute or more with atmospheric refraction. The 10-minute sampling limits moon
  crossings to about a minute.
- The unit tests check sun events against an independent low-precision solar model (the
  Astronomical Almanac's formulas). Across three sites and five dates the two agree to within 3
  seconds; the tests allow 30.
- Golden files in `src/model/testdata/` pin every number above for three sites (Seattle,
  Edinburgh and Sydney) under all three threshold settings. They were captured from the original
  prototype, so the TypeScript model reproduces it exactly.
- Expect small differences from AllSky's Swift planner, mostly in moonrise and moonset. That
  planner uses the SwiftAA ephemeris, 5-minute crossing scans and its own moon altitude definition.
- Computing the 14-month range, about 425 nights, takes about half a second. Each night needs 8
  sun searches and 242 altitude samples. The work runs in 24 ms slices so the page stays
  responsive, and repeats when the site or range changes. Changing a threshold only re-derives
  the numbers; it doesn't recompute positions.
