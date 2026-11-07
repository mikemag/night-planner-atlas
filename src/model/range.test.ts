import { beforeAll, describe, expect, it } from 'vitest';
import type { Site } from './night';
import {
  computeRange,
  computeRangeSync,
  bestWeekend,
  centeredLunations,
  FULL_CYCLE,
  lunWindow,
  lunationWindow,
  nightDates,
  rangeStart,
  tonightId,
  type NightRange,
} from './range';
import { MS_D, TimeZone } from './time';

const SEATTLE: Site = {
  name: 'Seattle',
  lat: 47.60621,
  lon: -122.34253,
  tz: 'America/Los_Angeles',
};
const LA = new TimeZone('America/Los_Angeles');
const NOW = Date.UTC(2026, 8, 24, 3, 0, 0); // Sep 23, 2026, 8 PM in Seattle

describe('range bounds', () => {
  it('start the month before the current one, shifted by whole years', () => {
    expect(rangeStart(NOW, LA, 0)).toEqual({ y: 2026, m: 8, count: 14 });
    expect(rangeStart(NOW, LA, -1)).toEqual({ y: 2025, m: 8, count: 14 });
    expect(rangeStart(NOW, LA, 1)).toEqual({ y: 2027, m: 8, count: 14 });
    expect(rangeStart(Date.UTC(2027, 0, 10, 20), LA, 0)).toEqual({ y: 2026, m: 12, count: 14 });
  });

  it('cover every local date of the 14 months', () => {
    const dates = nightDates({ y: 2026, m: 8, count: 14 });
    expect(dates).toHaveLength(426);
    expect(dates[0]).toEqual([2026, 8, 1]);
    expect(dates[dates.length - 1]).toEqual([2027, 9, 30]);
  });

  it('call it tonight after local noon and last night before', () => {
    expect(tonightId(NOW, LA)).toBe('2026-09-23');
    expect(tonightId(Date.UTC(2026, 8, 24, 16), LA)).toBe('2026-09-23'); // 9 AM
    expect(tonightId(Date.UTC(2026, 8, 24, 20), LA)).toBe('2026-09-24'); // 1 PM
  });

  it('reserve ±15 positions for Full cycle unless new-moon focus narrows them', () => {
    expect(lunWindow(0)).toBe(15);
    expect(lunWindow(5)).toBe(5);
  });
});

describe('a computed range', () => {
  let r: NightRange;
  beforeAll(() => {
    r = computeRangeSync(SEATTLE, 0, { moonAlt: 0, crescent: 0 }, FULL_CYCLE, NOW);
  }, 30_000);

  it('uses the optional site elevation and treats missing elevation as sea level', () => {
    const high = computeRangeSync(
      { ...SEATTLE, elevation: 2000 },
      0,
      { moonAlt: 0, crescent: 0 },
      14,
      NOW,
    );
    expect(high.site.elevation).toBe(2000);
    expect(high.nights[0].ev.sunset).toBeLessThan(r.nights[0].ev.sunset!);
    expect(high.nights[0].ev.sunrise).toBeGreaterThan(r.nights[0].ev.sunrise!);
    expect(high.nights.map((n) => n.id)).toEqual(r.nights.map((n) => n.id));
  });

  it('knows tonight', () => {
    expect(r.nights[r.tonightIdx].id).toBe('2026-09-23');
  });

  it('spans every sunset and sunrise on its axis', () => {
    for (const n of r.nights) {
      if (n.evH.sunset != null) expect(n.evH.sunset).toBeGreaterThanOrEqual(r.ax.start);
      if (n.evH.sunrise != null) expect(n.evH.sunrise).toBeLessThanOrEqual(r.ax.end);
    }
    expect(r.ax.start % 0.5).toBe(0);
    expect(r.ax.end % 0.5).toBe(0);
  });

  it('lays out months in Sunday-first weeks covering each night once', () => {
    expect(r.months).toHaveLength(14);
    const seen = new Set<number>();
    for (const mo of r.months) {
      for (const wk of mo.weeks) {
        expect(wk).toHaveLength(7);
        wk.forEach((i, d) => {
          if (i < 0) return;
          expect(r.nights[i].dow).toBe(d);
          seen.add(i);
        });
      }
    }
    expect(seen.size).toBe(r.nights.length);
    // Aug 1, 2026 is a Saturday: six blanks first
    expect(r.months[0].weeks[0]).toEqual([-1, -1, -1, -1, -1, -1, 0]);
  });

  it('totals months from their nights', () => {
    for (const mo of r.months) {
      const total = mo.idx.reduce((s, i) => s + r.nights[i].mfMs, 0);
      expect(mo.total).toBeCloseTo(total, 3);
      expect(mo.good).toBe(mo.idx.filter((i) => r.nights[i].mfMs >= 4 * 3600e3).length);
    }
    expect(r.maxMF).toBe(Math.max(1, ...r.nights.map((n) => n.mfMs)));
  });

  it('aligns nights on the nearest new moon', () => {
    const newMoonNights = r.nights.filter((n) => n.quarter === 0);
    expect(newMoonNights.length).toBeGreaterThanOrEqual(13);
    for (const n of newMoonNights) expect(n.nmOff).toBe(0);
    for (const n of r.nights) expect(Math.abs(n.nmOff)).toBeLessThanOrEqual(15);
  });

  it('owns every loaded night exactly once, including range edges and clock changes', () => {
    const seen: number[] = [];
    const moons = r.quarters.filter((q) => q.q === 0);
    for (const L of r.lunations) {
      expect([29, 30]).toContain(L.last - L.first + 1);
      expect(L.first).toBeGreaterThanOrEqual(L.i - FULL_CYCLE);
      expect(L.last).toBeLessThanOrEqual(L.i + FULL_CYCLE);
      for (let i = Math.max(0, L.first); i <= Math.min(r.nights.length - 1, L.last); i++) {
        seen.push(i);
        const distance = Math.abs(r.nights[i].mid - L.t);
        for (const moon of moons)
          expect(distance).toBeLessThanOrEqual(Math.abs(r.nights[i].mid - moon.t));
      }
    }
    expect(seen).toEqual(r.nights.map((_, i) => i));
    expect(r.lunations[0].first).toBeLessThan(0);
    expect(r.lunations.at(-1)!.last).toBeGreaterThanOrEqual(r.nights.length);
    expect(r.lunations.reduce((sum, L) => sum + L.total, 0)).toBeCloseTo(
      r.nights.reduce((sum, n) => sum + n.mfMs, 0),
      3,
    );
  });

  it('keeps focused windows cropped within ownership', () => {
    for (const L of r.lunations) {
      expect(lunationWindow(L, FULL_CYCLE)).toEqual({ first: L.first, last: L.last });
      expect(lunationWindow(L, 3)).toEqual({ first: L.i - 3, last: L.i + 3 });
    }
  });

  it('uses each site’s actual midnight across northern and southern clock changes', () => {
    const dates = nightDates({ y: 2026, m: 10, count: 6 });
    const nights = dates.map(([y, m, d]) => ({ y, m, d }));
    for (const zone of ['UTC', 'Europe/London', 'Australia/Sydney']) {
      const tz = new TimeZone(zone);
      const firstMidnight = tz.utcForWall(Date.UTC(2026, 9, 2));
      const moons = r.quarters
        .filter((q) => q.q === 0)
        .map((q) => ({ ...q, i: Math.round((q.t - firstMidnight) / MS_D) }));
      const cycles = centeredLunations(nights, tz, moons);
      for (const [i, [y, m, d]] of dates.entries()) {
        const midnight = tz.utcForWall(Date.UTC(y, m - 1, d + 1));
        const nearest = moons.reduce((a, b) =>
          Math.abs(b.t - midnight) < Math.abs(a.t - midnight) ? b : a,
        );
        const owners = cycles.filter((L) => i >= L.first && i <= L.last);
        expect(owners).toHaveLength(1);
        expect(owners[0].t).toBe(nearest.t);
        expect(Math.abs(i - owners[0].i)).toBeLessThanOrEqual(FULL_CYCLE);
      }
    }
  });

  it('picks each lunation’s best weekend from its Friday and Saturday', () => {
    for (const L of r.lunations) {
      if (!L.best) continue;
      const fri = r.nights[L.best.i],
        sat = r.nights[L.best.i + 1];
      expect(fri.dow).toBe(5);
      expect(sat.dow).toBe(6);
      expect(L.best.sum).toBe(fri.mfMs + sat.mfMs);
      expect(L.best.i).toBeGreaterThanOrEqual(L.first);
      expect(L.best.i + 1).toBeLessThanOrEqual(L.last);
    }
  });

  it('does not join a Friday and Saturday owned by adjacent cycles', () => {
    const sample = {
      ...r,
      nights: [
        { ...r.nights[0], dow: 5, mfMs: 3600e3 },
        { ...r.nights[1], dow: 6, mfMs: 7200e3 },
      ],
    };
    const L = { ...r.lunations[0], i: 0, first: 0, last: 0, total: 0, best: null };
    bestWeekend(sample, L, FULL_CYCLE);
    expect(L.total).toBe(3600e3);
    expect(L.best).toBeNull();
  });

  it('computes the same range in slices as in one go', async () => {
    let progress = 0;
    const sliced = await computeRange(SEATTLE, 0, { moonAlt: 0, crescent: 0 }, FULL_CYCLE, NOW, {
      sliceMs: 5,
      onProgress: (done) => (progress = done),
    });
    expect(progress).toBe(r.nights.length);
    expect(sliced?.nights.map((n) => n.mfMs)).toEqual(r.nights.map((n) => n.mfMs));
    expect(sliced?.lunations).toEqual(r.lunations);
  }, 30_000);

  it('stops when cancelled', async () => {
    const result = await computeRange(SEATTLE, 0, { moonAlt: 0, crescent: 0 }, 14, NOW, {
      isCancelled: () => true,
    });
    expect(result).toBeNull();
  });

  it('keeps an explicitly shared first month independent of now and includes leap day', async () => {
    const shared = await computeRange(SEATTLE, 0, { moonAlt: 0, crescent: 0 }, 14, NOW, {
      spec: { y: 2028, m: 2, count: 14 },
    });
    expect(shared!.spec).toEqual({ y: 2028, m: 2, count: 14 });
    expect(shared!.nights[0].id).toBe('2028-02-01');
    expect(shared!.nights.some((night) => night.id === '2028-02-29')).toBe(true);
    expect(shared!.nights.at(-1)!.id).toBe('2029-03-31');
  }, 30_000);
});

it('keeps an outside-center edge cycle and gives an exact midnight tie to the earlier new moon', () => {
  const dates = nightDates({ y: 2028, m: 1, count: 3 });
  const nights = dates.map(([y, m, d]) => ({ y, m, d }));
  const base = Date.UTC(2028, 0, 1);
  const moons = [-40, -10, 20, 50, 80, 110].map((day) => ({ t: base + day * MS_D, i: day - 1 }));
  const cycles = centeredLunations(nights, new TimeZone('UTC'), moons);
  expect(cycles[0].i).toBe(-11);
  // Jan 5's midnight (Jan 6 at 00:00) is equidistant from Dec 22 and Jan 21.
  expect(cycles[0].last).toBe(4);
  expect(cycles[1].first).toBe(5);
  const indices = cycles.flatMap((L) =>
    Array.from(
      { length: Math.min(nights.length - 1, L.last) - Math.max(0, L.first) + 1 },
      (_, k) => Math.max(0, L.first) + k,
    ),
  );
  expect(indices).toEqual(dates.map((_, i) => i));
  expect(dates[59]).toEqual([2028, 2, 29]);
});
