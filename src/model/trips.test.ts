import { describe, expect, it } from 'vitest';
import { DEFAULT_SITES } from '../app/default-sites';
import { computeRangeSync } from './range';
import { darkWeekendPeriods } from './trips';
import { MS_H } from './time';

const now = Date.parse('2026-11-05T20:30:00Z');
const sydney = DEFAULT_SITES.find((site) => site.tz === 'Australia/Sydney')!;
const range = computeRangeSync(sydney, 0, { moonAlt: 0, crescent: 0.2 }, 0, now);

describe('dark weekend trips', () => {
  it('can prefer a different weekend when staying for four nights', () => {
    const december = darkWeekendPeriods(range).find((p) => range.tz.wallParts(p.moon).m === 12)!;
    const short = december.bestWeekend!;
    const long = december.bestExtended!;
    expect(short.nights.map((n) => n.id)).toEqual(['2026-12-04', '2026-12-05']);
    expect(long.nights.map((n) => n.id)).toEqual([
      '2026-12-10',
      '2026-12-11',
      '2026-12-12',
      '2026-12-13',
    ]);
    expect(long.usable).toBe(long.nights.reduce((sum, n) => sum + n.mfMs, 0));
    expect(long.longest).toBe(Math.max(...long.nights.flatMap((n) => n.mf.map(([a, b]) => b - a))));
  });

  it('includes every local new moon in the loaded months, including past cycles', () => {
    const periods = darkWeekendPeriods(range);
    const first = range.nights[0];
    const last = range.nights.at(-1)!;
    const firstMonth = first.y * 12 + first.m;
    const lastMonth = last.y * 12 + last.m;
    const expected = range.quarters.filter(({ q, t }) => {
      const { y, m } = range.tz.wallParts(t);
      const month = y * 12 + m;
      return q === 0 && month >= firstMonth && month <= lastMonth;
    });
    expect(periods.map((period) => period.moon)).toEqual(expected.map(({ t }) => t));
    expect(periods[0].bestWeekend?.nights[0].noon).toBeLessThan(now);
  });

  it('assigns a boundary-crossing weekend once and requires the whole trip to be loaded', () => {
    const friday = range.nights.findIndex((n) => n.id === '2026-12-11');
    const period = range.lunations.find((cycle) => cycle.first <= friday && friday <= cycle.last)!;
    const boundary = {
      ...range,
      lunations: [
        { ...period, last: friday },
        { ...period, t: period.t + 29 * 24 * MS_H, first: friday + 1 },
      ],
    };
    const [first, second] = darkWeekendPeriods(boundary);
    expect(first.candidates.at(-1)?.extended).toMatchObject({
      nights: range.nights.slice(friday - 1, friday + 3),
    });
    expect(second.candidates.some((c) => c.weekend.nights[0].id === '2026-12-11')).toBe(false);

    const clipped = { ...boundary, nights: range.nights.slice(0, friday + 2) };
    const [loaded] = darkWeekendPeriods(clipped);
    expect(loaded.candidates.at(-1)?.extended).toBeNull();
    expect(darkWeekendPeriods(clipped)).toHaveLength(1);
  });

  it('breaks ties by earlier dates and declines zero-hour picks', () => {
    const [period] = darkWeekendPeriods(range);
    const withUsable = (mfMs: number) => ({
      ...range,
      nights: range.nights.map((night) => ({ ...night, mfMs })),
    });
    const [tie] = darkWeekendPeriods(withUsable(MS_H));
    expect(tie.bestWeekend).toBe(tie.candidates[0].weekend);
    expect(tie.bestExtended).toBe(tie.candidates.find((c) => c.extended)?.extended);
    const [zero] = darkWeekendPeriods(withUsable(0));
    expect(zero.candidates).toHaveLength(period.candidates.length);
    expect(zero.bestWeekend).toBeNull();
    expect(zero.bestExtended).toBeNull();
  });
});
