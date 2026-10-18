import { Body, Observer, SearchRiseSet } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { NS, STEP, SUN_EVENTS, computeNight, deriveNight, type SunEvent } from './night';
import usno from './testdata/usno.json';
import { MS_H, MS_M, TimeZone } from './time';

type ReferenceCase = (typeof usno.cases)[number];
type Table = 'sun' | 'moon' | 'civil' | 'nautical' | 'astronomical';

function night(c: ReferenceCase) {
  const [y, m, d] = c.night.split('-').map(Number);
  const observer = new Observer(c.site.lat, c.site.lon, 0);
  const n = computeNight(observer, new TimeZone(c.site.tz), y, m, d);
  deriveNight(n, { moonAlt: 0, crescent: 0 });
  return { n, observer };
}

/** USNO columns are rise/begin then set/end, on the printed UTC calendar date. */
function tableTimes(c: ReferenceCase, table: Table, column: 0 | 1, start: number, end: number) {
  return c.utcDays.flatMap((day) => {
    const value = day[table].slice(column * 5, column * 5 + 4);
    if (value.trim() === '' || value === '////' || value === '====') return [];
    expect(value).toMatch(/^\d{4}$/);
    const time = Date.parse(`${day.date}T${value.slice(0, 2)}:${value.slice(2)}:00Z`);
    return time >= start && time <= end ? [time] : [];
  });
}

const SOLAR: Record<SunEvent, [Table, 0 | 1]> = {
  sunset: ['sun', 1],
  civilDusk: ['civil', 1],
  nauticalDusk: ['nautical', 1],
  astroDusk: ['astronomical', 1],
  astroDawn: ['astronomical', 0],
  nauticalDawn: ['nautical', 0],
  civilDawn: ['civil', 0],
  sunrise: ['sun', 0],
};

function expectTime(actual: number | null, reference: number | null, toleranceMs: number) {
  if (reference == null) expect(actual).toBeNull();
  else {
    expect(actual).not.toBeNull();
    expect(Math.abs(actual! - reference)).toBeLessThan(toleranceMs);
  }
}

describe('USNO tables (offline, independent, minute-rounded)', () => {
  for (const c of usno.cases) {
    it(`${c.site.name} ${c.night}: all eight solar events and absent twilight`, () => {
      const { n } = night(c);
      for (const event of SUN_EVENTS) {
        const [table, column] = SOLAR[event];
        const times = tableTimes(c, table, column, n.noon, n.noon + 24 * MS_H);
        expect(times.length).toBeLessThanOrEqual(1);
        // Allow table rounding plus small ephemeris/convention differences.
        expectTime(n.ev[event], times[0] ?? null, MS_M);
      }
      if (c.site.name === 'Edinburgh') {
        expect(n.td).toBeNull();
        expect(n.mf).toEqual([]);
        expect(n.mfMs).toBe(0);
      }
    });

    it(`${c.site.name} ${c.night}: lunar upper limb agrees with USNO`, () => {
      const { n, observer } = night(c);
      const end = n.S0 + (NS - 1) * STEP;
      for (const [key, direction, column] of [
        ['moonRise', 1, 0],
        ['moonSet', -1, 1],
      ] as const) {
        const times = tableTimes(c, 'moon', column, n.S0, end);
        expect(times.length).toBeLessThanOrEqual(1);
        const reference = times[0] ?? null;
        // SearchRiseSet uses the upper limb and refraction, matching USNO's definition.
        const limb = SearchRiseSet(Body.Moon, observer, direction, new Date(n.S0), 20 / 24);
        expectTime(limb?.date.getTime() ?? null, reference, MS_M);
        expectTime(n[key], reference, MS_M);
        expectTime(n[key], limb?.date.getTime() ?? null, 1000);
      }
    });
  }

  it('keeps the reference dawn on the correct local date across both clock changes', () => {
    for (const [site, date, eveningOffset, morningOffset, hour, minute] of [
      ['Seattle', '2026-10-31', -420, -480, 6, 54],
      ['Sydney', '2026-10-03', 600, 660, 6, 29],
    ] as const) {
      const c = usno.cases.find((c) => c.site.name === site && c.night === date)!;
      const { n } = night(c);
      const sunrise = tableTimes(c, 'sun', 0, n.noon, n.noon + 24 * MS_H)[0];
      expect(n.dst).toBe(true);
      expect(n.tz.offsetMin(n.ev.sunset!)).toBe(eveningOffset);
      expect(n.tz.offsetMin(sunrise)).toBe(morningOffset);
      const nextDate = new Date(Date.parse(`${date}T12:00:00Z`) + 24 * MS_H);
      expect(n.tz.wallParts(sunrise)).toEqual({
        y: nextDate.getUTCFullYear(),
        m: nextDate.getUTCMonth() + 1,
        d: nextDate.getUTCDate(),
        h: hour,
        mi: minute,
      });
    }
  });
});
