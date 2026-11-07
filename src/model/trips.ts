import type { Night } from './night';
import type { NightRange } from './range';
import { MS_H, MS_M } from './time';

export interface ObservingTrip {
  nights: Night[];
  usable: number;
  astronomicalDarkness: number;
  longest: number;
}

export interface TripWeekend {
  weekend: ObservingTrip;
  extended: ObservingTrip | null;
}

export interface TripPeriod {
  moon: number;
  first: Night;
  last: Night;
  partial: boolean;
  astronomicalDarkness: number;
  usable: number;
  candidates: TripWeekend[];
  bestWeekend: ObservingTrip | null;
  bestExtended: ObservingTrip | null;
}

function trip(nights: Night[]): ObservingTrip {
  return {
    nights,
    usable: nights.reduce((total, n) => total + n.mfMs, 0),
    astronomicalDarkness: nights.reduce((total, n) => total + n.tdMs, 0),
    longest: Math.max(0, ...nights.flatMap((n) => n.mf.map(([start, end]) => end - start))),
  };
}

/** Rank complete trips independently. A trip belongs to the centered cycle containing Friday. */
export function darkWeekendPeriods(range: NightRange): TripPeriod[] {
  const { nights, lunations, tz } = range;
  if (!nights.length) return [];
  const start = nights[0].wallNoon - 12 * MS_H;
  const end = nights.at(-1)!.wallNoon + 12 * MS_H;
  const periods: TripPeriod[] = [];
  for (const cycle of lunations) {
    const wallMoon = cycle.t + tz.offsetMin(cycle.t) * MS_M;
    if (wallMoon < start || wallMoon >= end) continue;
    const first = Math.max(0, cycle.first);
    const last = Math.min(nights.length - 1, cycle.last);
    const candidates: TripWeekend[] = [];
    let bestWeekend: ObservingTrip | null = null;
    let bestExtended: ObservingTrip | null = null;
    for (let fri = first; fri <= last && fri + 1 < nights.length; fri++) {
      if (nights[fri].dow !== 5) continue;
      const weekend = trip(nights.slice(fri, fri + 2));
      const extended =
        fri - 1 < 0 || fri + 2 >= nights.length ? null : trip(nights.slice(fri - 1, fri + 3));
      candidates.push({ weekend, extended });
      if (weekend.usable > (bestWeekend?.usable ?? 0)) bestWeekend = weekend;
      if (extended && extended.usable > (bestExtended?.usable ?? 0)) bestExtended = extended;
    }
    const owned = nights.slice(first, last + 1);
    periods.push({
      moon: cycle.t,
      first: nights[first],
      last: nights[last],
      partial: first !== cycle.first || last !== cycle.last,
      astronomicalDarkness: owned.reduce((total, n) => total + n.tdMs, 0),
      usable: owned.reduce((total, n) => total + n.mfMs, 0),
      candidates,
      bestWeekend,
      bestExtended,
    });
  }
  return periods;
}
