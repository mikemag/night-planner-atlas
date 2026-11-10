import {
  Atmosphere,
  Body,
  Equator,
  Horizon,
  Illumination,
  MoonPhase,
  type Observer,
  SearchAltitude,
} from 'astronomy-engine';
import { pad2 } from './format';
import { apparentAltitude, solarHorizon } from './refraction';
import { moonWindows, type MoonWindow } from './moon';
import { moonlightOpacity } from './moonlight';
import { MS_D, MS_H, MS_M, type TimeZone } from './time';

export interface Site {
  name: string;
  lat: number;
  lon: number;
  tz: string;
  /** Metres above sea level; missing means sea level. No horizon dip is assumed. */
  elevation?: number;
}

export const SUN_EVENTS = [
  'sunset',
  'civilDusk',
  'nauticalDusk',
  'astroDusk',
  'astroDawn',
  'nauticalDawn',
  'civilDawn',
  'sunrise',
] as const;
export type SunEvent = (typeof SUN_EVENTS)[number];
/** Event times keyed by name: UTC ms in `ev`, wall-clock hours after local noon in `evH`. */
export type SunEvents = Record<SunEvent, number | null>;
export type Interval = [number, number];
export type SunBand = 'sun' | 'civil' | 'nautical' | 'astronomical';

/** Ordinary nights use 121 ten-minute samples; long/polar nights extend the window. */
export const STEP = 10 * MS_M;
export const NS = 121;
export const S_OFF = 2 * MS_H;

/** Planning thresholds: when the moon counts as up, and below what illumination to ignore it. */
export interface Thresholds {
  moonAlt: number;
  crescent: number;
}

/**
 * One observing night, labeled by the local date of its evening. Positions come from
 * {@link computeNight}; `quarter` and `nmOff` from the range; the rest from
 * {@link deriveNight}, which depends on the planning thresholds.
 */
export interface Night {
  id: string;
  y: number;
  m: number;
  d: number;
  dow: number;
  tz: TimeZone;
  /** Local noon as a wall time, and as an instant. */
  wallNoon: number;
  noon: number;
  nextNoon: number;
  /** Local midnight at the end of the evening date. */
  mid: number;
  /** First altitude sample. */
  S0: number;
  ev: SunEvents;
  evH: SunEvents;
  /** Intervals below each solar threshold, clipped to the observing night. */
  sunBelow: Record<SunBand, Interval[]>;
  /** Apparent center altitude, for drawing the altitude curve only. */
  moonAlt: Float32Array;
  /** Display-only phase/altitude wash opacity, on the same ten-minute grid. */
  moonlight: Float32Array;
  /** Refined upper-limb windows at every supported apparent horizon height. */
  moonWindows: Record<number, MoonWindow>;
  sunAlt: Float32Array;
  illum: number;
  phase: number;
  /** Clocks change between local noon and 8 AM the next morning. */
  dst: boolean;
  /** Moon quarter that falls in this night (0 new … 3 last), or −1. */
  quarter: number;
  /** Nights from the nearest new moon (negative before it). */
  nmOff: number;
  moonUp: Interval[];
  moonUpH: Interval[];
  /** First interval of astronomical darkness; sunBelow.astronomical contains every interval. */
  td: Interval | null;
  tdH: Interval | null;
  tdMs: number;
  moonIgnored: boolean;
  mf: Interval[];
  mfH: Interval[];
  mfMs: number;
  moonRise: number | null;
  moonSet: number | null;
}

/** Wall-clock hours after the night's local noon for the instant `ms`. */
export function wallH(ms: number, n: Pick<Night, 'tz' | 'wallNoon'>): number {
  return (ms + n.tz.offsetMin(ms) * MS_M - n.wallNoon) / MS_H;
}

export type SolarNight = Pick<
  Night,
  | 'id'
  | 'y'
  | 'm'
  | 'd'
  | 'dow'
  | 'tz'
  | 'wallNoon'
  | 'noon'
  | 'nextNoon'
  | 'mid'
  | 'ev'
  | 'evH'
  | 'sunBelow'
  | 'dst'
>;

/** Solar geometry, shared by range preparation and the complete night calculation. */
export function computeSolarNight(
  observer: Observer,
  tz: TimeZone,
  y: number,
  m: number,
  d: number,
): SolarNight {
  const wallNoon = Date.UTC(y, m - 1, d, 12);
  const noon = tz.utcForWall(wallNoon);
  const nextNoon = tz.utcForWall(Date.UTC(y, m - 1, d + 1, 12));
  const density = Atmosphere(observer.height).density;
  const sunHorizon = solarHorizon(density);
  const find = (dir: number, alt: number, from = noon): number | null => {
    if (from >= nextNoon) return null;
    try {
      const r = SearchAltitude(
        Body.Sun,
        observer,
        dir,
        new Date(from),
        (nextNoon - from) / MS_D,
        alt,
      );
      const t = r?.date.getTime();
      return t != null && t >= from && t < nextNoon ? t : null;
    } catch {
      return null;
    }
  };
  const ev: SunEvents = {
    sunset: find(-1, sunHorizon),
    civilDusk: find(-1, -6),
    nauticalDusk: find(-1, -12),
    astroDusk: find(-1, -18),
    astroDawn: find(+1, -18),
    nauticalDawn: find(+1, -12),
    civilDawn: find(+1, -6),
    sunrise: find(+1, sunHorizon),
  };
  const eq = Equator(Body.Sun, new Date(noon), observer, true, true);
  const initialAltitude = Horizon(new Date(noon), observer, eq.ra, eq.dec).altitude;
  const below = (alt: number, dusk: number | null, dawn: number | null): Interval[] => {
    const crossings: Array<{ t: number; below: boolean }> = [];
    for (const [first, direction] of [
      [dusk, -1],
      [dawn, 1],
    ] as const) {
      let t = first;
      while (t != null) {
        crossings.push({ t, below: direction < 0 });
        t = find(direction, alt, t + 1000);
      }
    }
    let start: number | null = initialAltitude < alt ? noon : null;
    const intervals: Interval[] = [];
    for (const crossing of crossings.sort((a, b) => a.t - b.t)) {
      if (crossing.below) start = crossing.t;
      else if (start != null) {
        if (crossing.t > start) intervals.push([start, crossing.t]);
        start = null;
      }
    }
    if (start != null && nextNoon > start) intervals.push([start, nextNoon]);
    return intervals;
  };
  const sunBelow = {
    sun: below(sunHorizon, ev.sunset, ev.sunrise),
    civil: below(-6, ev.civilDusk, ev.civilDawn),
    nautical: below(-12, ev.nauticalDusk, ev.nauticalDawn),
    astronomical: below(-18, ev.astroDusk, ev.astroDawn),
  };
  const n: SolarNight = {
    id: `${y}-${pad2(m)}-${pad2(d)}`,
    y,
    m,
    d,
    dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
    tz,
    wallNoon,
    noon,
    nextNoon,
    mid: tz.utcForWall(Date.UTC(y, m - 1, d + 1, 0)),
    ev,
    evH: { ...ev },
    sunBelow,
    dst: tz.offsetMin(noon) !== tz.offsetMin(noon + 20 * MS_H),
  };
  for (const k of SUN_EVENTS) {
    const t = ev[k];
    n.evH[k] = t == null ? null : wallH(t, n);
  }
  return n;
}

/** Sun and Moon data; a prepared solar night avoids repeating the range's geometry pass. */
export function computeNight(
  observer: Observer,
  tz: TimeZone,
  y: number,
  m: number,
  d: number,
  solar?: SolarNight,
): Night {
  const base = solar ?? computeSolarNight(observer, tz, y, m, d);
  const { noon, nextNoon, ev, sunBelow, mid } = base;
  const density = Atmosphere(observer.height).density;
  // Cover the whole dark part of long nights, preserving the ordinary 2 h–22 h window.
  const fullDay = ev.sunset == null || ev.sunrise == null;
  const S0 = fullDay
    ? noon
    : Math.min(
        noon + S_OFF,
        ...sunBelow.sun.map(([start]) => noon + Math.floor((start - noon) / STEP) * STEP),
      );
  const sampleEnd = fullDay
    ? nextNoon
    : Math.max(
        noon + S_OFF + (NS - 1) * STEP,
        ...sunBelow.sun.map(([, end]) => noon + Math.ceil((end - noon) / STEP) * STEP),
      );
  const samples = Math.round((sampleEnd - S0) / STEP) + 1;
  const moonAlt = new Float32Array(samples),
    moonlight = new Float32Array(samples),
    sunAlt = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = new Date(S0 + i * STEP);
    const em = Equator(Body.Moon, t, observer, true, true);
    const moonHeight = Horizon(t, observer, em.ra, em.dec).altitude;
    moonAlt[i] = apparentAltitude(moonHeight, density);
    moonlight[i] = moonlightOpacity(Illumination(Body.Moon, t).phase_angle, moonHeight);
    const es = Equator(Body.Sun, t, observer, true, true);
    sunAlt[i] = apparentAltitude(Horizon(t, observer, es.ra, es.dec).altitude, density);
  }
  const md = new Date(mid);
  const illum = Illumination(Body.Moon, md).phase_fraction;
  const phase = MoonPhase(md);
  const n: Night = {
    ...base,
    S0,
    moonAlt,
    moonlight,
    moonWindows: moonWindows(observer, S0, sampleEnd),
    sunAlt,
    illum,
    phase,
    quarter: -1,
    nmOff: 99,
    moonUp: [],
    moonUpH: [],
    td: null,
    tdH: null,
    tdMs: 0,
    moonIgnored: false,
    mf: [],
    mfH: [],
    mfMs: 0,
    moonRise: null,
    moonSet: null,
  };
  return n;
}

/** `iv` minus `cuts`, dropping pieces shorter than a minute. */
export function subtract(iv: Interval, cuts: Interval[]): Interval[] {
  let segs: Interval[] = [iv];
  for (const [a, b] of cuts) {
    segs = segs.flatMap(([x, y]): Interval[] => {
      if (b <= x || a >= y) return [[x, y]];
      const r: Interval[] = [];
      if (a > x) r.push([x, a]);
      if (b < y) r.push([b, y]);
      return r;
    });
  }
  return segs.filter(([x, y]) => y - x >= MS_M);
}

/** Sky stage at a site-local clock position, including continuous polar stages. */
export function sunBandAt(n: Night, hh: number): SunBand | 'day' {
  for (const band of ['astronomical', 'nautical', 'civil', 'sun'] as const)
    if (
      n.sunBelow[band].some(
        ([a, b]) =>
          hh >= wallH(a, n) && (hh < wallH(b, n) || (b === n.nextNoon && hh === wallH(b, n))),
      )
    )
      return band;
  return 'day';
}

/** Every real solar boundary, including repeated events in a long observing period. */
export function solarCrossings(n: Night): Array<{ event: SunEvent; t: number }> {
  const bands = ['sun', 'civil', 'nautical', 'astronomical'] as const;
  return SUN_EVENTS.flatMap((event, i) => {
    const setting = i < 4;
    const band = bands[setting ? i : 7 - i];
    const times = n.sunBelow[band]
      .map((interval) => interval[setting ? 0 : 1])
      .filter((t) => t > n.noon && t < n.nextNoon);
    const first = n.ev[event];
    if (first != null && !times.includes(first)) times.unshift(first);
    return times.map((t) => ({ event, t }));
  });
}

/** Fill in astronomical darkness, Moon-up intervals, and usable dark under the given thresholds. */
export function deriveNight(n: Night, th: Thresholds): void {
  n.moonUp = n.moonWindows[th.moonAlt].above;
  n.moonUpH = n.moonUp.map(([a, b]): Interval => [wallH(a, n), wallH(b, n)]);
  const dark = n.sunBelow.astronomical;
  n.td = dark[0] ?? null;
  n.tdH = n.td ? [wallH(n.td[0], n), wallH(n.td[1], n)] : null;
  n.tdMs = dark.reduce((sum, [a, b]) => sum + b - a, 0);
  n.moonIgnored = n.illum < th.crescent;
  n.mf = dark.flatMap((interval) =>
    n.moonIgnored ? [[...interval] as Interval] : subtract(interval, n.moonUp),
  );
  n.mfH = n.mf.map(([a, b]): Interval => [wallH(a, n), wallH(b, n)]);
  n.mfMs = n.mf.reduce((s, [a, b]) => s + b - a, 0);
  const hz = n.moonWindows[0].crossings;
  const rise = hz.find((c) => c.rising),
    set = hz.find((c) => !c.rising);
  n.moonRise = rise ? rise.t : null;
  n.moonSet = set ? set.t : null;
}
