import { beforeAll, describe, expect, it } from 'vitest';
import { Observer } from 'astronomy-engine';
import { computeNight, type Night } from '../model/night';
import { buildStructures, deriveRange, nightDates } from '../model/range';
import { TimeZone } from '../model/time';
import { DEFAULT_SITES } from './default-sites';
import {
  monthKey,
  packMonth,
  rangeMonths,
  siteKey,
  unpackMonth,
  type CachedMonth,
} from './night-cache-format';
import { NightCache } from './night-cache';

const now = Date.UTC(2026, 9, 28, 22);
for (const [site, y, m] of [
  [DEFAULT_SITES[0], 2026, 11],
  [DEFAULT_SITES[5], 2026, 12],
  [DEFAULT_SITES[5], 2027, 6],
] as const)
  describe(`cache round trip: ${site.name} ${y}-${m}`, () => {
    let nights: Night[], packed: CachedMonth;
    const tz = new TimeZone(site.tz),
      spec = { y, m, count: 1 },
      key = monthKey(site, y, m);
    beforeAll(() => {
      const observer = new Observer(site.lat, site.lon, site.elevation ?? 0);
      nights = nightDates(spec).map(([y, m, d]) => computeNight(observer, tz, y, m, d));
      packed = packMonth(key, nights);
    });
    it('preserves numerical data and summaries for every supported threshold combination', () => {
      const restored = unpackMonth(structuredClone(packed), key, y, m, new TimeZone(site.tz))!;
      expect(restored).not.toBeNull();
      expect(restored[0].moonAlt).toBeInstanceOf(Float32Array);
      const cold = buildStructures(nights, site, tz, spec, now);
      const warm = buildStructures(restored, site, restored[0].tz, spec, now);
      for (const moonAlt of [0, 5, 10, 15])
        for (const crescent of [0, 0.1, 0.2, 0.3])
          for (const focus of [3, 15]) {
            deriveRange(cold, { moonAlt, crescent }, focus);
            deriveRange(warm, { moonAlt, crescent }, focus);
            expect(warm.nights.map((n) => ({ ...n, tz: n.tz.name }))).toEqual(
              cold.nights.map((n) => ({ ...n, tz: n.tz.name })),
            );
            expect(warm.months).toEqual(cold.months);
            expect(warm.lunations).toEqual(cold.lunations);
          }
    });
    it('rejects damaged, incomplete and mismatched payloads', () => {
      for (const damage of [
        (p: CachedMonth) => {
          p.nights.pop();
        },
        (p: CachedMonth) => {
          p.key = 'other';
        },
        (p: CachedMonth) => {
          p.nights[0].moonAlt[0] = NaN;
        },
        (p: CachedMonth) => {
          p.nights[0].moonWindows[5].above = [[NaN, 1]];
        },
        (p: CachedMonth) => {
          p.nights[0].sunBelow.sun = [[1, 0]];
        },
        (p: CachedMonth) => {
          p.nights[0].ev.sunrise = NaN;
        },
      ]) {
        const value = structuredClone(packed);
        damage(value);
        expect(unpackMonth(value, key, y, m, tz)).toBeNull();
      }
    });
    it('rejects changed time-zone boundaries and restores fresh runtime classes', () => {
      class ChangedRules extends TimeZone {
        override utcForWall(wall: number): number {
          return super.utcForWall(wall) + 3600e3;
        }
      }
      expect(unpackMonth(packed, key, y, m, new ChangedRules(site.tz))).toBeNull();
      expect(unpackMonth(packed, key, y, m, tz)![0].tz).toBe(tz);
    });
  });
it('keys exact compute inputs, treats omitted elevation as zero, and excludes site identity', () => {
  const site = { ...DEFAULT_SITES[0] };
  const key = monthKey(site, 2026, 10);
  expect(monthKey({ ...site, name: 'Renamed', id: 'different' } as typeof site, 2026, 10)).toBe(
    key,
  );
  expect(siteKey({ ...site, elevation: undefined })).toBe(siteKey({ ...site, elevation: 0 }));
  for (const changed of [
    { ...site, lat: site.lat + 1e-10 },
    { ...site, lon: site.lon + 1e-10 },
    { ...site, elevation: 123 },
    { ...site, tz: 'UTC' },
  ])
    expect(monthKey(changed, 2026, 10)).not.toBe(key);
  expect(monthKey(site, 2026, 10, 'different-engine-or-format')).not.toBe(key);
  expect(monthKey(site, 2026, 11)).not.toBe(key);
});
it('partitions month ranges across years without duplicating overlapping months', () => {
  expect(rangeMonths({ y: 2026, m: 12, count: 3 })).toEqual([
    { y: 2026, m: 12 },
    { y: 2027, m: 1 },
    { y: 2027, m: 2 },
  ]);
});
it('treats missing IndexedDB as an optional cache failure', async () => {
  const cache = new NightCache();
  expect(await cache.get(['key'])).toEqual(new Map());
  expect(await cache.put([])).toBe(false);
  expect(await cache.info()).toBeNull();
  expect(await cache.clear()).toBe(false);
});
