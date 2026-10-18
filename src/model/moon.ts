import { Atmosphere, Equator, Body, Horizon, KM_PER_AU, type Observer } from 'astronomy-engine';
import type { Interval } from './night';
import { geometricAltitude } from './refraction';
import { MS_M } from './time';

export const MOON_THRESHOLDS = [0, 5, 10, 15] as const;
/** Astronomy Engine's equatorial lunar radius, also used by its SearchRiseSet. */
const MOON_RADIUS_AU = 1738.1 / KM_PER_AU;
const TIME_TOLERANCE = 50; // ms: numerical tolerance, not atmospheric/ephemeris accuracy

export interface Crossing {
  t: number;
  rising: boolean;
}
export interface MoonWindow {
  above: Interval[];
  crossings: Crossing[];
}

/** Topocentric geometric upper-limb altitude (variable apparent radius). */
export function moonUpperLimb(observer: Observer, ms: number): number {
  const date = new Date(ms);
  const eq = Equator(Body.Moon, date, observer, true, true);
  return (
    Horizon(date, observer, eq.ra, eq.dec).altitude +
    (Math.asin(MOON_RADIUS_AU / eq.dist) * 180) / Math.PI
  );
}

/** Geometric upper-limb altitude at an apparent horizon height. */
export function moonHorizonAltitude(height: number, density = 1): number {
  // The almanac horizon convention fixes refraction at 34 arcminutes. Above the
  // horizon use normal altitude-dependent refraction, applied to the upper limb.
  return height === 0 ? (-34 / 60) * density : geometricAltitude(height, density);
}

/** Find an extremum in a bracket containing a single smooth peak or trough. */
function extremum(altitude: (ms: number) => number, a: number, b: number, peak: boolean): number {
  const ratio = (Math.sqrt(5) - 1) / 2;
  const value = (t: number) => altitude(t) * (peak ? 1 : -1);
  let x = b - ratio * (b - a),
    y = a + ratio * (b - a);
  let fx = value(x),
    fy = value(y);
  while (b - a > TIME_TOLERANCE) {
    if (fx > fy) {
      b = y;
      y = x;
      fy = fx;
      x = b - ratio * (b - a);
      fx = value(x);
    } else {
      a = x;
      x = y;
      fx = fy;
      y = a + ratio * (b - a);
      fy = value(y);
    }
  }
  return (a + b) / 2;
}

/**
 * Split the smooth lunar altitude curve into monotone arcs. Guard samples outside
 * the window find extrema near either boundary. Refining the extrema before searching
 * thresholds preserves grazing rise/set pairs even when both fall between grid samples.
 */
export function altitudeArcs(
  altitude: (ms: number) => number,
  start: number,
  end: number,
): number[] {
  const step = 10 * MS_M;
  const times: number[] = [];
  for (let t = start - step; t < end; t += step) times.push(t);
  times.push(end, end + step);
  const values = times.map(altitude);
  const nodes = [start, end];
  for (let i = 1; i < times.length - 1; i++) {
    const left = values[i] - values[i - 1],
      right = values[i + 1] - values[i];
    if ((left > 0 && right <= 0) || (left < 0 && right >= 0)) {
      const t = extremum(altitude, times[i - 1], times[i + 1], left > 0);
      if (t > start && t < end) nodes.push(t);
    }
  }
  return nodes.sort((a, b) => a - b);
}

/** Refine every threshold crossing on the monotone arcs by bisection. */
export function windowAbove(
  altitude: (ms: number) => number,
  nodes: number[],
  threshold: number,
): MoonWindow {
  const crossings: Crossing[] = [];
  let start: number | null = altitude(nodes[0]) > threshold ? nodes[0] : null;
  const above: Interval[] = [];
  for (let i = 1; i < nodes.length; i++) {
    let a = nodes[i - 1],
      b = nodes[i];
    const before = altitude(a) > threshold,
      after = altitude(b) > threshold;
    if (before === after) continue;
    while (b - a > TIME_TOLERANCE) {
      const mid = (a + b) / 2;
      if (altitude(mid) > threshold === before) a = mid;
      else b = mid;
    }
    const t = (a + b) / 2;
    crossings.push({ t, rising: after });
    if (after) start = t;
    else if (start != null) {
      above.push([start, t]);
      start = null;
    }
  }
  if (start != null) above.push([start, nodes[nodes.length - 1]]);
  return { above, crossings };
}

export function moonWindows(
  observer: Observer,
  start: number,
  end: number,
): Record<number, MoonWindow> {
  const altitude = (ms: number) => moonUpperLimb(observer, ms);
  const nodes = altitudeArcs(altitude, start, end);
  const density = Atmosphere(observer.height).density;
  return Object.fromEntries(
    MOON_THRESHOLDS.map((height) => [
      height,
      windowAbove(altitude, nodes, moonHorizonAltitude(height, density)),
    ]),
  );
}
