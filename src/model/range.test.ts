import { beforeAll, describe, expect, it } from 'vitest';
import type { Site } from './night';
import {
  computeRange,
  computeRangeSync,
  lunWindow,
  nightDates,
  rangeStart,
  tonightId,
  weekendsAhead,
  type NightRange,
} from './range';
import { TimeZone } from './time';

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

  it('use ±14 nights for lunations unless new-moon focus narrows them', () => {
    expect(lunWindow(0)).toBe(14);
    expect(lunWindow(5)).toBe(5);
  });
});

describe('a computed range', () => {
  let r: NightRange;
  beforeAll(() => {
    r = computeRangeSync(SEATTLE, 0, { moonAlt: 0, crescent: 0 }, 14, NOW);
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

  it('picks each lunation’s best weekend from its Friday and Saturday', () => {
    for (const L of r.lunations) {
      if (!L.best) continue;
      const fri = r.nights[L.best.i],
        sat = r.nights[L.best.i + 1];
      expect(fri.dow).toBe(5);
      expect(sat.dow).toBe(6);
      expect(L.best.sum).toBe(fri.mfMs + sat.mfMs);
      expect(Math.abs(L.best.i - L.i)).toBeLessThanOrEqual(14);
    }
  });

  it('lists dark weekends from tonight on', () => {
    const list = weekendsAhead(r);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(7);
    for (const w of list) {
      expect(w.i).toBeGreaterThanOrEqual(r.tonightIdx);
      expect(r.nights[w.i].dow).toBe(5);
    }
    // the first pick is the Oct 9–10 new-moon weekend at the demo site
    expect(r.nights[list[0].i].id).toBe('2026-10-09');
  });

  it('computes the same range in slices as in one go', async () => {
    let progress = 0;
    const sliced = await computeRange(SEATTLE, 0, { moonAlt: 0, crescent: 0 }, 14, NOW, {
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
});
