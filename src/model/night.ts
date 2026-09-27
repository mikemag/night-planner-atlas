import {
  Body,
  Equator,
  Horizon,
  Illumination,
  MoonPhase,
  type Observer,
  SearchAltitude,
} from 'astronomy-engine';
import { pad2 } from './format';
import { MS_H, MS_M, type TimeZone } from './time';

export interface Site {
  name: string;
  lat: number;
  lon: number;
  tz: string;
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

/** Moon and Sun altitudes are sampled every 10 minutes from local noon + 2 h (121 samples). */
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
  /** Local midnight at the end of the evening date. */
  mid: number;
  /** First altitude sample. */
  S0: number;
  ev: SunEvents;
  evH: SunEvents;
  moonAlt: Float32Array;
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
export function wallH(ms: number, n: Night): number {
  return (ms + n.tz.offsetMin(ms) * MS_M - n.wallNoon) / MS_H;
}

/** Sun events and Sun and Moon altitude samples for the night starting on local date y-m-d. */
export function computeNight(
  observer: Observer,
  tz: TimeZone,
  y: number,
  m: number,
  d: number,
): Night {
  const wallNoon = Date.UTC(y, m - 1, d, 12);
  const noon = tz.utcForWall(wallNoon);
  const t0 = new Date(noon);
  const find = (dir: number, alt: number): number | null => {
    try {
      const r = SearchAltitude(Body.Sun, observer, dir, t0, 1, alt);
      return r ? r.date.getTime() : null;
    } catch {
      return null;
    }
  };
  const ev: SunEvents = {
    sunset: find(-1, -0.833),
    civilDusk: find(-1, -6),
    nauticalDusk: find(-1, -12),
    astroDusk: find(-1, -18),
    astroDawn: find(+1, -18),
    nauticalDawn: find(+1, -12),
    civilDawn: find(+1, -6),
    sunrise: find(+1, -0.833),
  };
  const S0 = noon + S_OFF;
  const moonAlt = new Float32Array(NS),
    sunAlt = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const t = new Date(S0 + i * STEP);
    const em = Equator(Body.Moon, t, observer, true, true);
    moonAlt[i] = Horizon(t, observer, em.ra, em.dec, 'normal').altitude;
    const es = Equator(Body.Sun, t, observer, true, true);
    sunAlt[i] = Horizon(t, observer, es.ra, es.dec, 'normal').altitude;
  }
  const mid = tz.utcForWall(Date.UTC(y, m - 1, d + 1, 0));
  const md = new Date(mid);
  const illum = Illumination(Body.Moon, md).phase_fraction;
  const phase = MoonPhase(md);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const n: Night = {
    id: `${y}-${pad2(m)}-${pad2(d)}`,
    y,
    m,
    d,
    dow,
    tz,
    wallNoon,
    noon,
    mid,
    S0,
    ev,
    evH: { ...ev },
    moonAlt,
    sunAlt,
    illum,
    phase,
    dst: false,
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
  for (const k of SUN_EVENTS) {
    const t = ev[k];
    n.evH[k] = t == null ? null : wallH(t, n);
  }
  n.dst = tz.offsetMin(noon) !== tz.offsetMin(noon + 20 * MS_H);
  return n;
}

export interface Crossing {
  t: number;
  rising: boolean;
}

/** Times at which sampled altitudes cross `thr`, by linear interpolation between samples. */
export function crossings(arr: ArrayLike<number>, S0: number, thr: number): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1] - thr,
      b = arr[i] - thr;
    if (a > 0 !== b > 0) out.push({ t: S0 + (i - 1 + a / (a - b)) * STEP, rising: b > 0 });
  }
  return out;
}

/** Intervals during which sampled altitudes are above `thr`. */
export function intervalsAbove(arr: ArrayLike<number>, S0: number, thr: number): Interval[] {
  const out: Interval[] = [];
  let start: number | null = arr[0] > thr ? S0 : null;
  for (const c of crossings(arr, S0, thr)) {
    if (c.rising) start = c.t;
    else if (start != null) {
      out.push([start, c.t]);
      start = null;
    }
  }
  if (start != null) out.push([start, S0 + (arr.length - 1) * STEP]);
  return out;
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

/** Fill in true dark, moon-up and moon-free intervals under the given thresholds. */
export function deriveNight(n: Night, th: Thresholds): void {
  const E = n.ev;
  n.moonUp = intervalsAbove(n.moonAlt, n.S0, th.moonAlt);
  n.moonUpH = n.moonUp.map(([a, b]): Interval => [wallH(a, n), wallH(b, n)]);
  const dusk = E.astroDusk,
    dawn = E.astroDawn;
  n.td = dusk != null && dawn != null && dawn > dusk ? [dusk, dawn] : null;
  n.tdH = n.td ? [wallH(n.td[0], n), wallH(n.td[1], n)] : null;
  n.tdMs = n.td ? n.td[1] - n.td[0] : 0;
  n.moonIgnored = n.illum < th.crescent;
  n.mf = n.td ? (n.moonIgnored ? [[n.td[0], n.td[1]]] : subtract(n.td, n.moonUp)) : [];
  n.mfH = n.mf.map(([a, b]): Interval => [wallH(a, n), wallH(b, n)]);
  n.mfMs = n.mf.reduce((s, [a, b]) => s + b - a, 0);
  const hz = crossings(n.moonAlt, n.S0, 0);
  const rise = hz.find((c) => c.rising),
    set = hz.find((c) => !c.rising);
  n.moonRise = rise ? rise.t : null;
  n.moonSet = set ? set.t : null;
}
