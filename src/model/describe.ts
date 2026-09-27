import { fmtClock, fmtClockS } from './format';
import { NS, STEP, wallH, type Night } from './night';
import { MS_H, MS_M } from './time';

/** Moon phase name from illumination and phase angle, with AllSky's thresholds. */
export function phaseName(n: Night): string {
  const a = n.phase;
  if (n.illum < 0.03) return 'New moon';
  if (n.illum > 0.97) return 'Full moon';
  if (Math.abs(n.illum - 0.5) < 0.06) return a < 180 ? 'First quarter' : 'Third quarter';
  if (n.illum < 0.5) return a < 180 ? 'Waxing crescent' : 'Waning crescent';
  return a < 180 ? 'Waxing gibbous' : 'Waning gibbous';
}

/** Sky stage at `hh` wall-clock hours after local noon. */
export function phaseAt(n: Night, hh: number): string {
  const E = n.evH;
  const inside = (a: number | null, b: number | null) =>
    a != null && b != null && hh >= a && hh < b;
  if (inside(E.astroDusk, E.astroDawn)) return 'True dark';
  if (inside(E.nauticalDusk, E.nauticalDawn)) return 'Astronomical twilight';
  if (inside(E.civilDusk, E.civilDawn)) return 'Nautical twilight';
  if (inside(E.sunset, E.sunrise)) return 'Civil twilight';
  return 'Day';
}

/** Interpolated moon altitude at `hh` wall-clock hours after local noon, or null outside the samples. */
export function moonAltAt(n: Night, hh: number): number | null {
  // hh is wall-clock hours; samples are uniform in real time
  const t = n.wallNoon + hh * MS_H;
  const real = t - n.tz.offsetMin(t) * MS_M;
  const f = (real - n.S0) / STEP;
  if (f < 0 || f > NS - 1) return null;
  const i = Math.floor(f),
    r = f - i;
  return n.moonAlt[i] * (1 - r) + n.moonAlt[Math.min(NS - 1, i + 1)] * r;
}

/** Short lines for an expanded calendar cell: dark window, moon, sun, twilight lengths. */
export function nightFacts(n: Night): string[] {
  const E = n.evH,
    out: string[] = [];
  out.push(n.tdH ? `Dark ${fmtClockS(n.tdH[0])}–${fmtClockS(n.tdH[1])}` : 'No true dark');
  const inNight = (t: number | null): t is number =>
    t != null &&
    E.sunset != null &&
    E.sunrise != null &&
    wallH(t, n) > E.sunset &&
    wallH(t, n) < E.sunrise;
  const moon: string[] = [];
  if (inNight(n.moonRise)) moon.push(`rises ${fmtClockS(wallH(n.moonRise, n))}`);
  if (inNight(n.moonSet)) moon.push(`sets ${fmtClockS(wallH(n.moonSet, n))}`);
  out.push(
    `Moon ${Math.round(n.illum * 100)}% · ${moon.length ? moon.join(', ') : n.moonUp.length && n.mfMs === 0 ? 'up all night' : 'down all night'}`,
  );
  out.push(`Sun ${fmtClockS(E.sunset)} → ${fmtClockS(E.sunrise)}`);
  const tw = (a: number | null, b: number | null) =>
    a != null && b != null ? Math.round((b - a) * 60) : null;
  const ev = tw(E.sunset, E.astroDusk),
    mo = tw(E.astroDawn, E.sunrise);
  if (ev != null && mo != null)
    out.push(`Twilight ${Math.floor(ev / 60)}h ${ev % 60}m / ${Math.floor(mo / 60)}h ${mo % 60}m`);
  return out;
}

/** The night's moon-free windows as text, or why there are none. */
export function windowsText(n: Night): string {
  if (!n.tdH) return 'No astronomical darkness this night';
  if (!n.mfH.length)
    return `Moon up through all true dark (${fmtClock(n.tdH[0])} – ${fmtClock(n.tdH[1])})`;
  return n.mfH.map(([a, b]) => `${fmtClock(a)} – ${fmtClock(b)}`).join('  ·  ');
}
