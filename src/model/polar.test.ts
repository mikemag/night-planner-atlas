import { Observer } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { phaseAt } from './describe';
import {
  computeNight,
  deriveNight,
  solarCrossings,
  SUN_EVENTS,
  type Site,
  type SunEvent,
} from './night';
import { needsFullDay } from './range';
import { findCrossing, sunAltitude } from './testdata/reference-sun';
import { MS_D, MS_H, MS_M, TimeZone } from './time';

const KHO: Site = { name: 'Kjell Henriksen', lat: 78.148, lon: 16.043, tz: 'Arctic/Longyearbyen' };
const TARGETS = [-0.833, -6, -12, -18];
const BANDS = ['sun', 'civil', 'nautical', 'astronomical'] as const;
const night = (site: Site, month: number, day: number, ignoreMoon = false) => {
  const n = computeNight(
    new Observer(site.lat, site.lon, site.elevation ?? 0),
    new TimeZone(site.tz),
    2026,
    month,
    day,
  );
  deriveNight(n, { moonAlt: 0, crescent: ignoreMoon ? 1 : 0 });
  return n;
};

describe('polar observing nights', () => {
  it('keeps both sunsets when an overridden zone places two of them inside a 25-hour period', () => {
    const n = night({ ...KHO, lat: 0, lon: 110, tz: 'Europe/Oslo' }, 10, 24);
    const sunsets = solarCrossings(n).filter(({ event }) => event === 'sunset');
    expect(sunsets).toHaveLength(2);
    expect(n.sunBelow.sun).toHaveLength(2);
    expect(sunsets.map(({ t }) => t)).toEqual(n.sunBelow.sun.map(([start]) => start));
    expect(n.ev.sunset).toBe(sunsets[0].t);
  });
  it('shows continuous summer daylight without inventing a sunset or darkness', () => {
    const n = night(KHO, 6, 21);
    expect(SUN_EVENTS.every((event) => n.ev[event] == null)).toBe(true);
    expect(BANDS.every((band) => n.sunBelow[band].length === 0)).toBe(true);
    expect(n.mfMs).toBe(0);
    expect(phaseAt(n, 12)).toBe('Day');
    expect(needsFullDay(n)).toBe(true);
  });

  it('retains midday twilight and nighttime darkness when the Sun never rises', () => {
    const n = night(KHO, 12, 21);
    expect(n.ev.sunrise).toBeNull();
    expect(n.ev.sunset).toBeNull();
    expect(n.sunBelow.sun).toEqual([[n.noon, n.nextNoon]]);
    expect(n.sunBelow.civil).toEqual([[n.noon, n.nextNoon]]);
    expect(phaseAt(n, 0)).toBe('Nautical twilight');
    expect(phaseAt(n, 12)).toBe('Astronomical darkness');
    expect(n.tdMs / MS_H).toBeGreaterThan(15);
    expect(n.tdMs / MS_H).toBeLessThan(16);
    expect(n.S0).toBe(n.noon);
    expect(n.moonAlt).toHaveLength(145);
  });

  it.each([
    [85, 12],
    [90, 12],
    [-85, 6],
    [-90, 6],
  ])(
    '%i° latitude: counts continuous astronomical darkness through the complete observing period',
    (lat, month) => {
      const n = night({ ...KHO, lat, lon: 0, tz: 'Etc/UTC' }, month, 21, true);
      expect(n.sunBelow.astronomical).toEqual([[n.noon, n.nextNoon]]);
      expect(n.tdMs).toBe(MS_D);
      expect(phaseAt(n, 24)).toBe('Astronomical darkness');
      expect(n.mf).toEqual([[n.noon, n.nextNoon]]);
      expect(n.mfMs).toBe(MS_D);
    },
  );

  it('keeps both dark intervals when an overridden clock zone splits darkness at noon', () => {
    const n = night({ ...KHO, tz: 'America/Los_Angeles' }, 12, 21, true);
    expect(n.sunBelow.astronomical).toHaveLength(2);
    expect(n.mf).toEqual(n.sunBelow.astronomical);
    expect(n.mf[0][0]).toBe(n.noon);
    expect(n.mf[1][1]).toBe(n.nextNoon);
    expect(n.tdMs).toBe(n.mf.reduce((sum, [a, b]) => sum + b - a, 0));
  });

  it.each([
    [85, 10, 24, 25],
    [-90, 3, 28, 23],
  ])('uses actual elapsed time across the clock change at %i°', (lat, month, day, hours) => {
    const n = night({ ...KHO, lat }, month, day);
    expect(n.nextNoon - n.noon).toBe(hours * MS_H);
    expect(n.sunBelow.sun).toEqual([[n.noon, n.nextNoon]]);
    expect(n.S0).toBe(n.noon);
    expect(n.moonAlt.length).toBe(hours * 6 + 1);
    for (const [a, b] of n.moonUp) {
      expect(a).toBeGreaterThanOrEqual(n.noon);
      expect(b).toBeLessThanOrEqual(n.nextNoon);
    }
  });

  it.each([
    [3, 20],
    [6, 21],
    [12, 21],
  ])('agrees with the independent solar model on %i/%i', (month, day) => {
    const n = night(KHO, month, day);
    for (const [i, event] of SUN_EVENTS.entries()) {
      const target = TARGETS[i < 4 ? i : 7 - i];
      const ref = findCrossing(
        (t) => sunAltitude(t, KHO.lat, KHO.lon),
        n.noon,
        n.nextNoon,
        target,
        i < 4 ? -1 : 1,
      );
      if (ref == null) expect(n.ev[event]).toBeNull();
      else expect(Math.abs(n.ev[event]! - ref)).toBeLessThan(30_000);
    }
  });

  it('classifies solar stages through polar seasons, including one-sided event days', () => {
    for (const lat of [KHO.lat, 85, -85, 90, -90]) {
      for (let day = 1; day <= 365; day++) {
        const date = new Date(Date.UTC(2026, 0, day));
        const n = night(
          { ...KHO, lat, lon: 0, tz: 'Etc/UTC' },
          date.getUTCMonth() + 1,
          date.getUTCDate(),
        );
        for (let t = n.noon; t < n.nextNoon; t += 30 * MS_M) {
          const altitude = sunAltitude(t, lat, 0);
          BANDS.forEach((band, i) => {
            if (Math.abs(altitude - TARGETS[i]) < 0.02) return;
            const inside = n.sunBelow[band].some(([a, b]) => t >= a && t < b);
            expect(inside, `${lat}° ${n.id} ${band} ${new Date(t).toISOString()}`).toBe(
              altitude < TARGETS[i],
            );
          });
        }
      }
    }
  }, 30_000);
});

// USNO UTC annual tables, retrieved 2026-10-31, sea level, minute-rounded.
// https://aa.usno.navy.mil/calculated/rstt/year?year=2026&task=0&lat=78.148&lon=16.043&label=KHO&tz=0&tz_sign=1
// https://aa.usno.navy.mil/calculated/rstt/year?year=2026&task=4&lat=78.148&lon=16.043&label=KHO&tz=0&tz_sign=1
it.each([
  [3, 20, 'sunset', '2026-03-20T17:20:00Z'],
  [3, 20, 'sunrise', '2026-03-21T04:42:00Z'],
  [12, 9, 'astroDusk', '2026-12-09T15:20:00Z'],
  [12, 9, 'astroDawn', '2026-12-10T06:18:00Z'],
  [12, 21, 'astroDusk', '2026-12-21T15:13:00Z'],
  [12, 21, 'astroDawn', '2026-12-22T06:35:00Z'],
] as Array<[number, number, SunEvent, string]>)(
  'matches the USNO polar reference on %i/%i: %s',
  (month, day, event, utc) => {
    expect(Math.abs(night(KHO, month, day).ev[event]! - Date.parse(utc))).toBeLessThan(MS_M);
  },
);
