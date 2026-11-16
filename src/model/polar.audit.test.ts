import { Observer } from 'astronomy-engine';
import { expect, it } from 'vitest';
import { computeSolarNight } from './night';
import { sunAltitude } from './testdata/reference-sun';
import { MS_M, TimeZone } from './time';

it('classifies solar stages through polar seasons, including one-sided event days', () => {
  const targets = [-0.833, -6, -12, -18];
  const bands = ['sun', 'civil', 'nautical', 'astronomical'] as const;
  for (const lat of [78.148, 85, -85, 90, -90]) {
    const observer = new Observer(lat, 0, 0);
    const tz = new TimeZone('Etc/UTC');
    for (let day = 1; day <= 365; day++) {
      const date = new Date(Date.UTC(2026, 0, day));
      // This audit checks only solar geometry; lunar sampling cannot affect its assertions.
      const n = computeSolarNight(observer, tz, 2026, date.getUTCMonth() + 1, date.getUTCDate());
      for (let t = n.noon; t < n.nextNoon; t += 30 * MS_M) {
        const altitude = sunAltitude(t, lat, 0);
        bands.forEach((band, i) => {
          if (Math.abs(altitude - targets[i]) < 0.02) return;
          const inside = n.sunBelow[band].some(([a, b]) => t >= a && t < b);
          expect(inside, `${lat}° ${n.id} ${band} ${new Date(t).toISOString()}`).toBe(
            altitude < targets[i],
          );
        });
      }
    }
  }
}, 30_000);
