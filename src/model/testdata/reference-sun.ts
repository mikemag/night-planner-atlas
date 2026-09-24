/**
 * An independent, low-precision solar model for cross-checking sun events.
 *
 * Formulas from the Astronomical Almanac's "low precision formulas for the Sun" (good to
 * about 0.01° in position between 1950 and 2050), plus a standard GMST expression. They
 * share nothing with Astronomy Engine, so agreement checks our wiring: time zones, the
 * search window, longitude sign and altitude thresholds.
 */
const DEG = Math.PI / 180;

/** Geometric altitude of the Sun's center, in degrees, at `ms` for the given site. */
export function sunAltitude(ms: number, lat: number, lon: number): number {
  const n = ms / 86400000 + 2440587.5 - 2451545.0;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmstDeg = 280.46061837 + 360.98564736629 * n;
  const H = (gmstDeg + lon) * DEG - ra;
  const phi = lat * DEG;
  return (
    Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / DEG
  );
}

/**
 * First time in [t0, t1] at which `alt` crosses `target` in the given direction (+1 rising,
 * −1 setting), found by a 2-minute scan and bisection; null if it never does.
 */
export function findCrossing(
  alt: (ms: number) => number,
  t0: number,
  t1: number,
  target: number,
  direction: 1 | -1,
): number | null {
  const step = 2 * 60000;
  let a = t0,
    fa = alt(a) - target;
  for (let b = t0 + step; b <= t1; b += step) {
    const fb = alt(b) - target;
    const crosses = direction > 0 ? fa < 0 && fb >= 0 : fa > 0 && fb <= 0;
    if (crosses) {
      let lo = a,
        hi = b;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        const fm = alt(mid) - target;
        if (direction > 0 ? fm < 0 : fm > 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    a = b;
    fa = fb;
  }
  return null;
}
