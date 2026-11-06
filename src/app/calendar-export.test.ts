import { beforeAll, expect, test } from 'vitest';
import { makeCalendarRecords, selectCalendarEvents } from './calendar-export';
import { DEFAULT_SITES } from './default-sites';
import { computeRangeSync, type NightRange } from '../model/range';
import { MS_M } from '../model/time';

let range: NightRange;
beforeAll(() => {
  range = computeRangeSync(
    DEFAULT_SITES[0],
    0,
    { moonAlt: 0, crescent: 0 },
    15,
    Date.parse('2026-11-06T22:00:00Z'),
  );
});

test('uses the site civil date for an actual new moon and keeps the full-cycle weekend pick', () => {
  const selected = selectCalendarEvents(range, { from: '2026-11-06', through: '2026-12-05' }, 60);
  expect(selected.moons.map((event) => event.start)).toEqual(['2026-11-08']);
  expect(selected.weekends.map((event) => event.start)).toEqual(['2026-11-06', '2026-12-04']);
  // Both dates must fit. A different weekend inside the export does not become the winner.
  expect(
    selectCalendarEvents(range, { from: '2026-11-07', through: '2026-11-15' }, 60).weekends,
  ).toEqual([]);
});

test('filters on exact elapsed total with a strict boundary, including split windows', () => {
  const start = '2026-11-06';
  const nights = range.nights.map((n) => {
    if (n.id !== start && n.id !== '2026-11-07') return n;
    const elapsed = 60 * MS_M + (n.id === start ? 0 : 1);
    return {
      ...n,
      mfMs: elapsed,
      mf: [
        [n.noon, n.noon + 30 * MS_M],
        [n.mid, n.mid + elapsed - 30 * MS_M],
      ] as typeof n.mf,
    };
  });
  const chosen = selectCalendarEvents(
    { ...range, nights },
    { from: start, through: '2026-11-07' },
    60,
  );
  expect(chosen.nights.map((event) => event.start)).toEqual(['2026-11-07']);
});

test('an early morning new moon includes the previous evening even outside the export dates', () => {
  const dates = { from: '2026-10-10', through: '2026-10-10' };
  const { moons } = selectCalendarEvents(range, dates, 60);
  const [entry] = makeCalendarRecords(
    range,
    moons,
    dates,
    { moonAlt: 0, crescent: 0 },
    60,
    'https://atlas.example/',
    false,
  );
  expect(entry.start).toBe('2026-10-10');
  expect(entry.url).toContain('night=2026-10-09');
  expect(entry.description).toContain('Fri Oct 9 → Sat Oct 10');
  expect(entry.description).toContain('Usable dark:');
  expect(entry.description).toContain('Sunrise: Oct 10');
});
