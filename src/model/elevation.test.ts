import {
  Atmosphere,
  Body,
  Equator,
  Horizon,
  Observer,
  Refraction,
  SearchRiseSet,
} from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { computeNight, deriveNight, NS, STEP } from './night';
import { moonUpperLimb } from './moon';
import { apparentAltitude, geometricAltitude } from './refraction';
import { MS_H, TimeZone } from './time';

const tz = new TimeZone('America/Los_Angeles');
function night(elevation: number) {
  const observer = new Observer(47.60621, -122.34253, elevation);
  const n = computeNight(observer, tz, 2026, 10, 3);
  deriveNight(n, { moonAlt: 0, crescent: 0 });
  return { n, observer };
}

describe('site elevation with a level horizon', () => {
  it.each([-400, 2000, 4500])(
    '%i m: Moon events agree with the library’s level-horizon search',
    (elevation) => {
      const { n, observer } = night(elevation);
      for (const [event, direction] of [
        ['moonRise', 1],
        ['moonSet', -1],
      ] as const) {
        // Default metersAboveGround=0: elevation changes position/air density, not horizon dip.
        const ref = SearchRiseSet(
          Body.Moon,
          observer,
          direction,
          new Date(n.S0),
          ((NS - 1) * STEP) / (24 * MS_H),
        );
        expect(n[event]).not.toBeNull();
        expect(ref).not.toBeNull();
        expect(Math.abs(n[event]! - ref!.date.getTime())).toBeLessThan(1000);
      }
      for (const [event, direction] of [
        ['sunset', -1],
        ['sunrise', 1],
      ] as const) {
        const ref = SearchRiseSet(Body.Sun, observer, direction, new Date(n.noon), 1);
        // Atlas retains the conventional fixed solar semidiameter; the library varies it.
        expect(Math.abs(n.ev[event]! - ref!.date.getTime())).toBeLessThan(10_000);
      }
    },
  );

  it('thinner air shifts horizon events modestly without a mountain-top horizon dip', () => {
    const sea = night(0).n;
    const high = night(2000).n;
    for (const [a, b] of [
      [high.ev.sunset!, sea.ev.sunset!],
      [sea.ev.sunrise!, high.ev.sunrise!],
      [sea.moonRise!, high.moonRise!],
      [high.moonSet!, sea.moonSet!],
    ]) {
      expect(b - a).toBeGreaterThan(10_000);
      expect(b - a).toBeLessThan(90_000);
    }
    // Twilight is geometric: it receives the tiny position correction, no refraction/dip.
    expect(Math.abs(high.ev.astroDusk! - sea.ev.astroDusk!)).toBeLessThan(1000);
    expect(Math.abs(high.ev.astroDawn! - sea.ev.astroDawn!)).toBeLessThan(1000);
  });

  it('uses elevation-scaled refraction for elevated Moon horizons and chart curves', () => {
    const { n, observer } = night(2000);
    const density = Atmosphere(2000).density;
    for (const height of [5, 10, 15]) {
      expect(n.moonWindows[height].crossings.length).toBeGreaterThan(0);
      for (const crossing of n.moonWindows[height].crossings) {
        const geometric = moonUpperLimb(observer, crossing.t);
        expect(
          Math.abs(geometric + density * Refraction('normal', geometric) - height),
        ).toBeLessThan(0.0002);
      }
    }
    for (const i of [0, 30, 60, 90, 120]) {
      const date = new Date(n.S0 + i * STEP);
      for (const [body, samples] of [
        [Body.Moon, n.moonAlt],
        [Body.Sun, n.sunAlt],
      ] as const) {
        const eq = Equator(body, date, observer, true, true);
        const geometric = Horizon(date, observer, eq.ra, eq.dec).altitude;
        expect(
          Math.abs(samples[i] - (geometric + density * Refraction('normal', geometric))),
        ).toBeLessThan(0.00001);
      }
    }
  });

  it('inverts the scaled refraction at every supported elevated horizon', () => {
    for (const elevation of [-400, 2000, 8000]) {
      const density = Atmosphere(elevation).density;
      for (const height of [5, 10, 15]) {
        expect(apparentAltitude(geometricAltitude(height, density), density)).toBeCloseTo(
          height,
          10,
        );
      }
    }
  });
});
