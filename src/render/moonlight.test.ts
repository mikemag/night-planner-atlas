import { describe, expect, it } from 'vitest';
import { Observer } from 'astronomy-engine';
import { computeNight, deriveNight, type Interval } from '../model/night';
import { TimeZone } from '../model/time';
import { DEFAULT_SITES } from '../app/default-sites';
import { moonlightAt, moonlightBands, moonlightStops } from './moonlight';

const bands = (td: Interval | null, mf: Interval[], above: Interval[]) =>
  moonlightBands({
    sunBelow: { sun: [], civil: [], nautical: [], astronomical: td ? [td] : [] },
    mf,
    moonWindows: { 0: { above, crossings: [] } },
  });

describe('physical moonlight and accepted moonlit time', () => {
  it('clips a continuous Moon to both dark intervals of a polar observing period', () => {
    expect(
      moonlightBands({
        sunBelow: {
          sun: [],
          civil: [],
          nautical: [],
          astronomical: [
            [0, 20],
            [80, 100],
          ],
        },
        mf: [],
        moonWindows: { 0: { above: [[0, 100]], crossings: [] } },
      }),
    ).toEqual({
      ordinary: [
        [0, 20],
        [80, 100],
      ],
      accepted: [],
    });
  });
  it('leaves strict moon-free windows plain black, clipping the wash to astronomical darkness', () => {
    expect(
      bands(
        [10, 90],
        [[30, 70]],
        [
          [0, 30],
          [70, 100],
        ],
      ),
    ).toEqual({
      ordinary: [
        [10, 30],
        [70, 90],
      ],
      accepted: [],
    });
  });
  it('colors only the low-moon extensions admitted at an elevated threshold', () => {
    expect(
      bands(
        [10, 90],
        [[20, 80]],
        [
          [0, 30],
          [70, 100],
        ],
      ),
    ).toEqual({
      ordinary: [
        [10, 20],
        [80, 90],
      ],
      accepted: [
        [20, 30],
        [70, 80],
      ],
    });
  });
  it('ignoring a crescent colors all of its moonlit astronomical darkness', () => {
    expect(
      bands(
        [10, 90],
        [[10, 90]],
        [
          [0, 30],
          [70, 100],
        ],
      ),
    ).toEqual({
      ordinary: [],
      accepted: [
        [10, 30],
        [70, 90],
      ],
    });
  });
  it('draws no moonlight bands without astronomical darkness or while the Moon is down', () => {
    expect(bands(null, [], [[0, 100]])).toEqual({ ordinary: [], accepted: [] });
    expect(bands([10, 90], [[10, 90]], [])).toEqual({ ordinary: [], accepted: [] });
  });
});

describe('sampled phase/altitude wash', () => {
  const site = DEFAULT_SITES[0];
  const observer = new Observer(site.lat, site.lon, site.elevation ?? 0);
  const tz = new TimeZone(site.tz);

  it('matches the reviewed brighter mapping on real crescent, quarter, gibbous and full nights', () => {
    // Independent two-minute design run recorded in #8, rounded to four decimals.
    for (const [day, minimum, maximum] of [
      [6, 0.2346, 0.2542],
      [18, 0.3227, 0.3353],
      [22, 0.4084, 0.4516],
      [25, 0.4957, 0.5368],
    ]) {
      const n = computeNight(observer, tz, 2026, 9, day);
      deriveNight(n, { moonAlt: 0, crescent: 0 });
      const values = moonlightBands(n).ordinary.flatMap((interval) =>
        moonlightStops(n, interval).map((s) => s.opacity),
      );
      expect(Math.abs(Math.min(...values) - minimum)).toBeLessThan(0.001);
      expect(Math.abs(Math.max(...values) - maximum)).toBeLessThan(0.001);
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.01);
    }
  });

  it('changes only the color classification when planning thresholds accept moonlight', () => {
    const n = computeNight(observer, tz, 2026, 9, 6);
    deriveNight(n, { moonAlt: 0, crescent: 0 });
    const [start, end] = moonlightBands(n).ordinary[0];
    const samples = n.moonlight;
    const original = Array.from(samples);
    for (const moonAlt of [0, 5, 10, 15])
      for (const crescent of [0, 0.1, 0.2, 0.3]) {
        deriveNight(n, { moonAlt, crescent });
        const bands = moonlightBands(n);
        const parts = [...bands.ordinary, ...bands.accepted].sort(([a], [b]) => a - b);
        expect(parts[0][0]).toBe(start);
        expect(parts.at(-1)![1]).toBe(end);
        expect(parts.reduce((total, [a, b]) => total + b - a, 0)).toBe(end - start);
        for (const [a, b] of parts) {
          const stops = moonlightStops(n, [a, b]);
          expect(stops[0]).toEqual({ offset: 0, opacity: moonlightAt(n, a) });
          expect(stops.at(-1)).toEqual({ offset: 1, opacity: moonlightAt(n, b) });
        }
        expect(n.moonlight).toBe(samples);
        expect(Array.from(n.moonlight)).toEqual(original);
      }
    const moonFree = computeNight(observer, tz, 2026, 9, 11);
    deriveNight(moonFree, { moonAlt: 0, crescent: 0.3 });
    expect(moonlightBands(moonFree)).toEqual({ ordinary: [], accepted: [] });
  });

  it('keeps gradients bounded and ordered across repeated or skipped clock hours and polar periods', () => {
    for (const [lat, lon, zone, month, day] of [
      [47.74, -122.32, 'America/Los_Angeles', 10, 31],
      [-33.7, 150.5, 'Australia/Sydney', 10, 3],
      [78.148, 16.043, 'Arctic/Longyearbyen', 12, 20],
    ] as const) {
      const n = computeNight(new Observer(lat, lon, 0), new TimeZone(zone), 2026, month, day);
      const stops = moonlightStops(n, [n.S0, n.S0 + (n.moonlight.length - 1) * 600000]);
      expect(stops.length).toBeGreaterThan(2);
      expect(stops[0].offset).toBe(0);
      expect(stops.at(-1)!.offset).toBe(1);
      expect(
        stops.every(
          (s, i) =>
            Number.isFinite(s.opacity) &&
            s.opacity >= 0.17 &&
            s.opacity <= 0.57 &&
            (i === 0 || s.offset > stops[i - 1].offset),
        ),
      ).toBe(true);
    }
  });
});
