import { expect, it } from 'vitest';
import { Observer } from 'astronomy-engine';
import { computeNight, solarCrossings } from './night';
import { formatPhaseCountdown, formatSiteClock, nextSolarPhase } from './site-clock';
import { MS_D, MS_M, TimeZone } from './time';
import { DEFAULT_SITES } from '../app/default-sites';
import usno from './testdata/usno.json';

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
    const next = nextSolarPhase(site, now)!;
    expect(next).toMatchObject({ event, name });
    expect(next.at).toBeGreaterThan(now + 1000);
    const before = nextSolarPhase(site, next.at - 2000)!;
    expect(before.event).toBe(next.event);
    expect(Math.abs(before.at - next.at)).toBeLessThan(1000);
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
      const next = nextSolarPhase(site, t - 10 * MS_M)!;
      expect(next.event).toBe(event);
      expect(Math.abs(next.at - t)).toBeLessThan(1000);
    }
  }
});

it('matches USNO sunset and twilight spot checks in both hemispheres', () => {
  for (const [name, night, event, at] of [
    ['Seattle', '2026-10-31', 'sunset', '2026-11-01T00:53:00Z'],
    ['Edinburgh', '2026-06-20', 'civilDusk', '2026-06-20T22:05:00Z'],
    ['Sydney', '2026-10-03', 'astroDawn', '2026-10-03T18:04:00Z'],
  ] as const) {
    const site = usno.cases.find((c) => c.site.name === name && c.night === night)!.site;
    const reference = Date.parse(at);
    const next = nextSolarPhase(site, reference - 10 * MS_M)!;
    expect(next.event).toBe(event);
    expect(Math.abs(next.at - reference)).toBeLessThan(MS_M);
  }
});

it('skips absent summer twilight and searches beyond a polar day without inventing noon events', () => {
  const summer = nextSolarPhase(DEFAULT_SITES[1], Date.parse('2026-06-21T00:00:00Z'))!;
  expect(summer).toMatchObject({ event: 'civilDawn', name: 'civil twilight' });
  for (const site of [DEFAULT_SITES[5], { name: 'North Pole', lat: 90, lon: 0, tz: 'UTC' }]) {
    const now = Date.parse('2026-06-21T12:00:00Z');
    const next = nextSolarPhase(site, now)!;
    expect(next).toMatchObject({ event: 'sunset', name: 'civil twilight' });
    expect(next.at - now).toBeGreaterThan(30 * MS_D);
    expect(next.at - now).toBeLessThan(100 * MS_D);
  }
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
