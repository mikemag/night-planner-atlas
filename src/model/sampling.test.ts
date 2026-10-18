import { Atmosphere, Body, Equator, Horizon, Observer, Refraction } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { computeNight, type Site } from './night';
import { MS_M, TimeZone } from './time';

const SITES: Site[] = [
  { name: 'Seattle', lat: 47.60621, lon: -122.34253, tz: 'America/Los_Angeles' },
  {
    name: 'Seattle at 2000 m',
    lat: 47.60621,
    lon: -122.34253,
    tz: 'America/Los_Angeles',
    elevation: 2000,
  },
  { name: 'Edinburgh', lat: 55.95, lon: -3.19, tz: 'Europe/London' },
  { name: 'Sydney', lat: -33.87, lon: 151.21, tz: 'Australia/Sydney' },
];

/**
 * Separate numerical audit, not an independent ephemeris: one-minute sampling finds
 * crossings (including pairs a ten-minute scan could miss), then bisection refines them.
 * This isolates interpolation error from the horizon definitions in reference.test.ts.
 */
describe('2026 Moon sampling accuracy across the supported planning thresholds', () => {
  for (const site of SITES) {
    it(`${site.name}: preserves crossings and bounds timing error for every night`, () => {
      const observer = new Observer(site.lat, site.lon, site.elevation ?? 0);
      const tz = new TimeZone(site.tz);
      const altitude = (ms: number) => {
        const date = new Date(ms);
        const eq = Equator(Body.Moon, date, observer, true, true);
        return (
          Horizon(date, observer, eq.ra, eq.dec).altitude +
          (Math.asin(1738.1 / (149597870.7 * eq.dist)) * 180) / Math.PI
        );
      };
      const density = Atmosphere(site.elevation ?? 0).density;
      const heights = [0, 5, 10, 15];
      for (let day = 0; day < 365; day++) {
        const date = new Date(Date.UTC(2026, 0, 1 + day));
        const n = computeNight(observer, tz, 2026, date.getUTCMonth() + 1, date.getUTCDate());
        const dense = Array.from({ length: 1201 }, (_, i) => altitude(n.S0 + i * MS_M));
        for (const height of heights) {
          const apparent = (geometric: number) =>
            height === 0
              ? geometric + (density * 34) / 60
              : geometric + density * Refraction('normal', geometric);
          const values = dense.map(apparent);
          const threshold = height;
          const fine: Array<{ t: number; rising: boolean }> = [];
          for (let i = 1; i < dense.length; i++) {
            if (values[i - 1] > threshold === values[i] > threshold) continue;
            const rising = values[i] > values[i - 1];
            let a = n.S0 + (i - 1) * MS_M;
            let b = a + MS_M;
            for (let k = 0; k < 20; k++) {
              const mid = (a + b) / 2;
              if (apparent(altitude(mid)) > threshold === rising) b = mid;
              else a = mid;
            }
            fine.push({ t: (a + b) / 2, rising });
          }
          const sampled = n.moonWindows[height].crossings;
          const label = `${site.name} ${n.id}, ${height}°`;
          expect(sampled, label).toHaveLength(fine.length);
          fine.forEach((reference, i) => {
            expect(sampled[i].rising, label).toBe(reference.rising);
            expect(Math.abs(sampled[i].t - reference.t), label).toBeLessThan(1000);
          });
        }
      }
    }, 30_000);
  }
});
