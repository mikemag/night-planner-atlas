import { expect, it } from 'vitest';
import { Observer } from 'astronomy-engine';
import { computeNight, deriveNight, solarCrossings, type Site } from './night';
import {
  formatPhaseCountdown,
  formatSiteClock,
  nextSolarPhase,
  nightStatus,
  formatNightStatus,
  nextClockTick,
} from './site-clock';
import { nightDates } from './range';
import { MS_D, MS_M, TimeZone } from './time';
import { DEFAULT_SITES } from '../app/default-sites';
import usno from './testdata/usno.json';

function night(site: Site = DEFAULT_SITES[0], y = 2026, m = 10, d = 28) {
  const n = computeNight(
    new Observer(site.lat, site.lon, site.elevation ?? 0),
    new TimeZone(site.tz),
    y,
    m,
    d,
  );
  deriveNight(n, { moonAlt: 0, crescent: 0 });
  return n;
}

it('shows the site date across the date line and a quarter-hour offset', () => {
  const now = Date.parse('2026-10-28T23:30:00Z');
  expect(formatSiteClock('Asia/Kathmandu', now)).toBe(
    'Oct 29, 5:15 AM GMT+5:45 (UTC+05:45) · Asia/Kathmandu',
  );
  expect(formatSiteClock('America/Los_Angeles', now)).toBe(
    'Oct 28, 4:30 PM PDT (UTC−07:00) · America/Los_Angeles',
  );
});

it('updates the civil offset through the repeated DST hour', () => {
  expect(formatSiteClock('America/Los_Angeles', Date.parse('2026-11-01T08:30:00Z'))).toContain(
    '1:30 AM PDT (UTC−07:00)',
  );
  expect(formatSiteClock('America/Los_Angeles', Date.parse('2026-11-01T09:30:00Z'))).toContain(
    '1:30 AM PST (UTC−08:00)',
  );
});

it('counts through every evening and morning phase, advancing at each boundary', () => {
  const site = DEFAULT_SITES[0];
  const nights = [night(site), night(site, 2026, 10, 29)];
  let now = Date.parse('2026-10-28T22:00:00Z');
  for (const [event, name] of [
    ['sunset', 'civil twilight'],
    ['civilDusk', 'nautical twilight'],
    ['nauticalDusk', 'astronomical twilight'],
    ['astroDusk', 'astronomical darkness'],
    ['astroDawn', 'astronomical twilight'],
    ['nauticalDawn', 'nautical twilight'],
    ['civilDawn', 'civil twilight'],
    ['sunrise', 'daylight'],
    ['sunset', 'civil twilight'],
  ]) {
    const next = nextSolarPhase(nights, now)!;
    expect(next).toMatchObject({ event, name });
    expect(next.at).toBeGreaterThan(now + 1000);
    const before = nextSolarPhase(nights, next.at - 1)!;
    expect(before.event).toBe(next.event);
    expect(before.at).toBe(next.at);
    now = next.at;
  }
});

it('agrees with chart crossings at elevated sites and across clock changes', () => {
  for (const [site, y, m, d] of [
    [DEFAULT_SITES[0], 2026, 10, 31],
    [DEFAULT_SITES[2], 2026, 10, 3],
    [DEFAULT_SITES[3], 2026, 12, 21],
  ] as const) {
    const night = computeNight(
      new Observer(site.lat, site.lon, site.elevation ?? 0),
      new TimeZone(site.tz),
      y,
      m,
      d,
    );
    for (const { event, t } of solarCrossings(night)) {
      const next = nextSolarPhase([night], t - 10 * MS_M)!;
      expect(next.event).toBe(event);
      expect(next.at).toBe(t);
    }
  }
});

it('matches USNO sunset and twilight spot checks in both hemispheres', () => {
  for (const [name, date, event, at] of [
    ['Seattle', '2026-10-31', 'sunset', '2026-11-01T00:53:00Z'],
    ['Edinburgh', '2026-06-20', 'civilDusk', '2026-06-20T22:05:00Z'],
    ['Sydney', '2026-10-03', 'astroDawn', '2026-10-03T18:04:00Z'],
  ] as const) {
    const site = usno.cases.find((c) => c.site.name === name && c.night === date)!.site;
    const reference = Date.parse(at);
    const [y, m, d] = date.split('-').map(Number);
    const next = nextSolarPhase([night(site, y, m, d)], reference - 10 * MS_M)!;
    expect(next.event).toBe(event);
    expect(Math.abs(next.at - reference)).toBeLessThan(MS_M);
  }
});

it('skips absent summer twilight and searches beyond a polar day without inventing noon events', () => {
  const summer = nextSolarPhase(
    [night(DEFAULT_SITES[1], 2026, 6, 20)],
    Date.parse('2026-06-21T00:00:00Z'),
  )!;
  expect(summer).toMatchObject({ event: 'civilDawn', name: 'civil twilight' });
  for (const site of [DEFAULT_SITES[5], { name: 'North Pole', lat: 90, lon: 0, tz: 'UTC' }]) {
    const now = Date.parse('2026-06-21T12:00:00Z');
    const nights = nightDates({ y: 2026, m: 6, count: 4 }).map(([y, m, d]) => night(site, y, m, d));
    const next = nightStatus(nights, now)!.solar!;
    expect(next).toMatchObject({ event: 'sunset', name: 'civil twilight' });
    expect(next.at - now).toBeGreaterThan(30 * MS_D);
    expect(next.at - now).toBeLessThan(100 * MS_D);
  }
});

it('combines shared starts and ends, keeping distinct boundaries separate even in the same minute', () => {
  const n = night();
  const a = n.ev.astroDusk!,
    b = n.ev.astroDawn!;
  n.mf = [[a, b]];
  const before = a - 14 * MS_M;
  expect(formatNightStatus(nightStatus([n], before), before)).toEqual({
    phase: '14min to astronomical darkness',
    dark: '+ usable dark',
    combined: 'start',
    active: false,
  });
  expect(formatNightStatus(nightStatus([n], b - 2 * 60 * MS_M), b - 2 * 60 * MS_M)).toEqual({
    phase: 'Usable dark now',
    dark: '2h left, until astronomical twilight',
    combined: 'end',
    active: true,
  });
  n.mf = [[a + 10_000, b]];
  const near = a - 13 * MS_M - 30_000;
  expect(formatNightStatus(nightStatus([n], near), near)).toMatchObject({
    phase: '14min to astronomical darkness',
    dark: 'usable dark in 14min',
    combined: '',
  });
});

it('tracks delayed starts, separate endings, gaps and exact window boundaries', () => {
  const n = night();
  const a = n.ev.astroDusk!,
    b = n.ev.astroDawn!;
  n.mf = [[a + 60 * MS_M, b - 2 * 60 * MS_M]];
  expect(formatNightStatus(nightStatus([n], a - 14 * MS_M), a - 14 * MS_M)).toMatchObject({
    phase: '14min to astronomical darkness',
    dark: 'usable dark in 1h 14min',
    combined: '',
    active: false,
  });
  expect(formatNightStatus(nightStatus([n], b - 4 * 60 * MS_M), b - 4 * 60 * MS_M)).toMatchObject({
    phase: '4h to astronomical twilight',
    dark: 'Usable dark now, 2h left',
    combined: '',
    active: true,
  });
  n.mf = [
    [a, a + 30 * MS_M],
    [a + 60 * MS_M, b],
  ];
  expect(nightStatus([n], a)!.usable).toEqual({ active: true, at: a + 30 * MS_M });
  expect(nightStatus([n], a + 30 * MS_M)!.usable).toEqual({ active: false, at: a + 60 * MS_M });
  expect(nextClockTick(nightStatus([n], a - 500), a - 500)).toBeLessThanOrEqual(500);
  expect(
    nextClockTick(nightStatus([n], a + 30 * MS_M - 500), a + 30 * MS_M - 500),
  ).toBeLessThanOrEqual(500);
  expect(nightStatus([n], b)!.usable).toBeNull();
});

it('does not count down to a later night when tonight has no usable darkness', () => {
  const nights = [25, 26, 27].map((d) => night(DEFAULT_SITES[0], 2026, 11, d));
  expect(nights[0].mf).toEqual([]);
  expect(nights[1].mf.length).toBeGreaterThan(0);
  for (const now of [Date.parse('2026-11-26T02:00:00Z'), nights[0].mid]) {
    const status = nightStatus(nights, now)!;
    expect(status).toMatchObject({ usable: null, usablePending: false });
    expect(formatNightStatus(status, now)).toMatchObject({
      dark: '',
      combined: '',
      active: false,
    });
  }
  // At local noon, the next observing night becomes current and can have a countdown again.
  const now = nights[1].noon;
  expect(nightStatus(nights, now)!.usable).toEqual({ active: false, at: nights[1].mf[0][0] });
});

it('clears usable status at the last window ending without jumping to tomorrow, including at dawn', () => {
  const nights = [26, 27].map((d) => night(DEFAULT_SITES[0], 2026, 11, d));
  const n = nights[0];
  const end = n.mf.at(-1)![1];
  expect(end).toBeLessThan(n.mid);
  expect(nightStatus(nights, end - 1)!.usable).toEqual({ active: true, at: end });
  for (const now of [end, n.mid, n.ev.astroDawn!, n.nextNoon - 1]) {
    const status = nightStatus(nights, now)!;
    expect(status).toMatchObject({ usable: null, usablePending: false });
    expect(formatNightStatus(status, now)).toMatchObject({
      dark: '',
      combined: '',
      active: false,
    });
  }
});

it('finishes the usable search during a night with no astronomical darkness', () => {
  const nights = nightDates({ y: 2026, m: 6, count: 4 }).map(([y, m, d]) =>
    night(DEFAULT_SITES[1], y, m, d),
  );
  const now = Date.parse('2026-06-21T00:00:00Z');
  expect(nightStatus(nights, now)).toMatchObject({ usable: null, usablePending: false });
  expect(formatNightStatus(nightStatus(nights, now), now).dark).toBe('');
});

it('joins usable windows across noon and never reports the end of coverage as a real ending', () => {
  const a = night(DEFAULT_SITES[5], 2026, 12, 21);
  const b = night(DEFAULT_SITES[5], 2026, 12, 22);
  a.sunBelow.astronomical = [[a.noon, a.nextNoon]];
  b.sunBelow.astronomical = [[b.noon, b.nextNoon]];
  a.mf = [[a.noon, a.nextNoon]];
  b.mf = [[b.noon, b.noon + 60 * MS_M]];
  const now = a.nextNoon - MS_M;
  expect(nightStatus([a, b], now)!.usable).toEqual({ active: true, at: b.noon + 60 * MS_M });
  expect(nightStatus([a, b], now)!.usablePending).toBe(false);
  expect(nightStatus([a], now)!.usable).toEqual({ active: true, at: null });
  expect(nightStatus([a], now)!.usablePending).toBe(true);
  expect(nightStatus([b], now)).toBeNull();
  const gap = night(DEFAULT_SITES[5], 2026, 12, 23);
  gap.mf = [[gap.noon, gap.nextNoon]];
  expect(nightStatus([a, gap], now)!.through).toBe(a.nextNoon);
  a.mf = [];
  expect(nightStatus([a], now)!.usablePending).toBe(true);
  expect(nightStatus([a, b], now)!.usable).toEqual({ active: false, at: b.noon });
  // A new night alone cannot extend the search; astronomical darkness must join at noon.
  b.sunBelow.astronomical = [[b.noon + 60 * MS_M, b.nextNoon]];
  b.mf = [[b.noon + 60 * MS_M, b.nextNoon]];
  expect(nightStatus([a, b], now)).toMatchObject({ usable: null, usablePending: false });
});

it('formats elapsed countdowns without zero, including a repeated local hour', () => {
  const next = { event: 'astroDawn' as const, name: 'astronomical twilight', at: 0 };
  for (const [remaining, duration] of [
    [1, '<1min'],
    [59_999, '<1min'],
    [60_000, '1min'],
    [60_001, '2min'],
    [14 * MS_M, '14min'],
    [60 * MS_M, '1h'],
    [74 * MS_M, '1h 14min'],
    [2 * MS_D + 74 * MS_M, '2d 1h 14min'],
  ] as const)
    expect(formatPhaseCountdown(next, -remaining)).toBe(`${duration} to astronomical twilight`);
  expect(
    formatPhaseCountdown(
      { ...next, at: Date.parse('2026-11-01T09:45:00Z') },
      Date.parse('2026-11-01T08:45:00Z'),
    ),
  ).toBe('1h to astronomical twilight');
});
