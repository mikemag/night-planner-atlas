import { Observer } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import { phaseName } from './describe';
import {
  SUN_EVENTS,
  computeNight,
  deriveNight,
  subtract,
  wallH,
  type Night,
  type Site,
  type SunEvent,
  type Thresholds,
} from './night';
import { findCrossing, sunAltitude } from './testdata/reference-sun';
import { moonUpperLimb, moonHorizonAltitude } from './moon';
import { MS_H, MS_M, TimeZone } from './time';

const SEATTLE: Site = {
  name: 'Seattle',
  lat: 47.60621,
  lon: -122.34253,
  tz: 'America/Los_Angeles',
};
const EDINBURGH: Site = { name: 'Edinburgh', lat: 55.95, lon: -3.19, tz: 'Europe/London' };
const SYDNEY: Site = { name: 'Sydney', lat: -33.87, lon: 151.21, tz: 'Australia/Sydney' };
const STRICT: Thresholds = { moonAlt: 0, crescent: 0 };

function night(site: Site, id: string, th: Thresholds = STRICT): Night {
  const [y, m, d] = id.split('-').map(Number);
  const n = computeNight(new Observer(site.lat, site.lon, 0), new TimeZone(site.tz), y, m, d);
  deriveNight(n, th);
  return n;
}

const ALTITUDE: Record<SunEvent, number> = {
  sunset: -0.833,
  civilDusk: -6,
  nauticalDusk: -12,
  astroDusk: -18,
  astroDawn: -18,
  nauticalDawn: -12,
  civilDawn: -6,
  sunrise: -0.833,
};
const setting = (k: SunEvent) => SUN_EVENTS.indexOf(k) < 4;

describe('sun events', () => {
  const cases: Array<[Site, string]> = [
    [SEATTLE, '2026-10-09'],
    [SEATTLE, '2026-12-21'],
    [SEATTLE, '2027-03-20'],
    [EDINBURGH, '2026-10-09'],
    [EDINBURGH, '2027-01-15'],
    [SYDNEY, '2026-10-09'],
    [SYDNEY, '2027-01-15'],
  ];
  it.each(cases)('agree with an independent solar model: %o %s', (site, id) => {
    const n = night(site, id);
    for (const k of SUN_EVENTS) {
      const ref = findCrossing(
        (t) => sunAltitude(t, site.lat, site.lon),
        n.noon,
        n.noon + 24 * MS_H,
        ALTITUDE[k],
        setting(k) ? -1 : 1,
      );
      expect(ref, k).not.toBeNull();
      expect(Math.abs((n.ev[k] as number) - (ref as number)), k).toBeLessThan(30_000);
    }
  });

  it('are ordered through the night and shown in local clock time', () => {
    const n = night(SEATTLE, '2026-10-09');
    const times = SUN_EVENTS.map((k) => n.ev[k] as number);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // wall-clock hours after local noon: sunset in the evening, sunrise the next morning
    expect(n.evH.sunset).toBeGreaterThan(6);
    expect(n.evH.sunset).toBeLessThan(7);
    expect(n.evH.sunrise).toBeGreaterThan(19);
    expect(n.evH.sunrise).toBeLessThan(20);
    expect(wallH(n.noon, n)).toBe(0);
    expect(wallH(n.mid, n)).toBe(12);
  });
});

describe('clock changes', () => {
  it('Seattle falls back during the night of Oct 31, 2026', () => {
    const n = night(SEATTLE, '2026-10-31');
    expect(n.dst).toBe(true);
    expect(n.tz.offsetMin(n.ev.sunset as number)).toBe(-7 * 60);
    expect(n.tz.offsetMin(n.ev.sunrise as number)).toBe(-8 * 60);
    // sunrise is read on the standard-time clock: just before 7 AM, not before 8 AM
    expect(n.tz.wallParts(n.ev.sunrise as number).h).toBe(6);
    expect(n.evH.sunrise).toBeCloseTo(18 + n.tz.wallParts(n.ev.sunrise as number).mi / 60, 1);
  });

  it('Sydney springs forward during the night of Oct 3, 2026', () => {
    const n = night(SYDNEY, '2026-10-03');
    expect(n.dst).toBe(true);
    expect(n.tz.offsetMin(n.ev.sunset as number)).toBe(10 * 60);
    expect(n.tz.offsetMin(n.ev.sunrise as number)).toBe(11 * 60);
  });

  it('an ordinary night has no clock change', () => {
    expect(night(SEATTLE, '2026-10-09').dst).toBe(false);
  });
});

describe('nights without astronomical darkness', () => {
  it('Edinburgh at midsummer never gets past nautical twilight', () => {
    const n = night(EDINBURGH, '2027-06-20');
    expect(n.ev.sunset).not.toBeNull();
    expect(n.ev.civilDusk).not.toBeNull();
    expect(n.ev.civilDawn).not.toBeNull();
    for (const k of ['nauticalDusk', 'astroDusk', 'astroDawn', 'nauticalDawn'] as const)
      expect(n.ev[k], k).toBeNull();
    expect(n.td).toBeNull();
    expect(n.mf).toEqual([]);
    expect(n.mfMs).toBe(0);
    // the independent model agrees the Sun stays above −12° all night
    let lowest = 90;
    for (let t = n.noon; t < n.noon + 24 * MS_H; t += 5 * MS_M)
      lowest = Math.min(lowest, sunAltitude(t, EDINBURGH.lat, EDINBURGH.lon));
    expect(lowest).toBeGreaterThan(-12);
  });
});

describe('moon-free intervals', () => {
  const H = MS_H;
  it('subtract removes cuts and drops slivers under a minute', () => {
    expect(
      subtract(
        [0, 10 * H],
        [
          [2 * H, 3 * H],
          [5 * H, 20 * H],
        ],
      ),
    ).toEqual([
      [0, 2 * H],
      [3 * H, 5 * H],
    ]);
    expect(subtract([0, 10 * H], [[30_000, 10 * H]])).toEqual([]);
    expect(subtract([0, H], [[2 * H, 3 * H]])).toEqual([[0, H]]);
  });

  it('a new-moon night is moon-free throughout astronomical darkness', () => {
    const n = night(SEATTLE, '2026-10-09');
    expect(phaseName(n)).toBe('New moon');
    expect(n.td).not.toBeNull();
    expect(n.mf).toEqual([n.td]);
    expect(n.mfMs).toBe(n.tdMs);
  });

  it('a full-moon night has no usable dark under default settings', () => {
    const n = night(SEATTLE, '2026-10-25');
    expect(phaseName(n)).toBe('Full moon');
    expect(n.tdMs).toBeGreaterThan(9 * H);
    expect(n.mfMs).toBe(0);
  });

  it('a rising moon ends the window at moonrise', () => {
    const n = night(SEATTLE, '2026-10-03');
    expect(n.mf).toHaveLength(1);
    expect(n.mf[0][0]).toBe(n.ev.astroDusk);
    expect(n.mf[0][1]).toBeCloseTo(n.moonRise as number, -1);
  });
});

describe('planning thresholds', () => {
  it('a higher moon threshold lengthens the window until the moon clears it', () => {
    const strict = night(SEATTLE, '2026-10-03');
    const ten = night(SEATTLE, '2026-10-03', { moonAlt: 10, crescent: 0 });
    expect(ten.mfMs).toBeGreaterThan(strict.mfMs + 45 * MS_M);
    const end = ten.mf[ten.mf.length - 1][1];
    expect(
      Math.abs(
        moonUpperLimb(new Observer(SEATTLE.lat, SEATTLE.lon, 0), end) - moonHorizonAltitude(10),
      ),
    ).toBeLessThan(0.0001);
  });

  it('a thin crescent below the cutoff is ignored', () => {
    const strict = night(SEATTLE, '2026-10-07');
    expect(strict.illum).toBeLessThan(0.1);
    expect(strict.mfMs).toBeLessThan(strict.tdMs);
    const lenient = night(SEATTLE, '2026-10-07', { moonAlt: 0, crescent: 0.2 });
    expect(lenient.moonIgnored).toBe(true);
    expect(lenient.mf).toEqual([lenient.td]);
    expect(lenient.mfMs).toBe(lenient.tdMs);
  });

  it('a brighter moon is not ignored', () => {
    const n = night(SEATTLE, '2026-10-03', { moonAlt: 0, crescent: 0.2 });
    expect(n.illum).toBeGreaterThan(0.2);
    expect(n.moonIgnored).toBe(false);
    expect(n.mfMs).toBeLessThan(n.tdMs);
  });
});

describe('phase names', () => {
  const at = (illum: number, phase: number) => phaseName({ illum, phase } as Night);
  it('follow the illumination thresholds', () => {
    expect(at(0.02, 5)).toBe('New moon');
    expect(at(0.98, 180)).toBe('Full moon');
    expect(at(0.5, 90)).toBe('First quarter');
    expect(at(0.5, 270)).toBe('Third quarter');
    expect(at(0.2, 50)).toBe('Waxing crescent');
    expect(at(0.2, 310)).toBe('Waning crescent');
    expect(at(0.8, 130)).toBe('Waxing gibbous');
    expect(at(0.8, 230)).toBe('Waning gibbous');
  });
});
