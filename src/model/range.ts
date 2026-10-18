import { NextMoonQuarter, Observer, SearchMoonQuarter } from 'astronomy-engine';
import { pad2 } from './format';
import { computeNight, deriveNight, type Night, type Site, type Thresholds } from './night';
import { MS_D, MS_H, TimeZone } from './time';

/** First month and number of months of a loaded range. */
export interface RangeSpec {
  y: number;
  m: number;
  count: number;
}

/** The month views' time axis, in wall-clock hours after local noon. */
export interface Axis {
  start: number;
  end: number;
}

/** A moon quarter (0 new, 1 first, 2 full, 3 last) and the night it falls in. */
export interface Quarter {
  q: number;
  t: number;
  i: number;
}

/** A Friday night index and the combined moon-free time of it and the Saturday after. */
export interface WeekendPick {
  i: number;
  sum: number;
}

export interface Lunation {
  /** New moon instant and the night it falls in (may be outside the range). */
  t: number;
  i: number;
  best: WeekendPick | null;
  total: number;
}

export interface Month {
  key: string;
  y: number;
  m: number;
  /** Night indices in the month, and the same laid out in Sunday-first weeks (−1 = blank). */
  idx: number[];
  weeks: number[][];
  total: number;
  good: number;
  nm: number[];
  fm: number[];
}

/** Every loaded night for one site, plus the structures the views share. */
export interface NightRange {
  site: Site;
  tz: TimeZone;
  spec: RangeSpec;
  nights: Night[];
  ax: Axis;
  quarters: Quarter[];
  lunations: Lunation[];
  months: Month[];
  maxMF: number;
  tonightIdx: number;
}

export const RANGE_MONTHS = 14;

/** The loaded range starts the month before the current one, shifted by whole years. */
export function rangeStart(now: number, tz: TimeZone, shift: number): RangeSpec {
  const p = tz.wallParts(now);
  let y = p.y,
    m = p.m - 1 + shift * 12;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { y, m, count: RANGE_MONTHS };
}

/** Every local date in the range, as [year, month, day]. */
export function nightDates(spec: RangeSpec): Array<[number, number, number]> {
  const list: Array<[number, number, number]> = [];
  let y = spec.y,
    m = spec.m;
  for (let k = 0; k < spec.count; k++) {
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) list.push([y, m, d]);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return list;
}

/** Lunation window: ±focus nights around new moon, or ±14 when focus is off. */
export function lunWindow(focus: number): number {
  return focus > 0 ? focus : 14;
}

/** "Tonight" is today's local date after noon and yesterday's before it. */
export function tonightId(now: number, tz: TimeZone): string {
  const p = tz.wallParts(now);
  if (p.h >= 12) return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
  const yd = new Date(Date.UTC(p.y, p.m - 1, p.d - 1));
  return `${yd.getUTCFullYear()}-${pad2(yd.getUTCMonth() + 1)}-${pad2(yd.getUTCDate())}`;
}

/** Index of the night whose local midnight is nearest `t` (may be outside the range). */
export function nightIndexForTime(nights: Night[], t: number): number {
  return Math.round((t - nights[0].mid) / MS_D);
}

/** Axis, moon quarters, lunations, months and tonight for freshly computed nights. */
export function buildStructures(
  nights: Night[],
  site: Site,
  tz: TimeZone,
  spec: RangeSpec,
  now: number,
): NightRange {
  // axis from the loaded range: earliest sunset to latest sunrise, padded
  let lo = 99,
    hi = -99;
  for (const n of nights) {
    if (n.evH.sunset != null) lo = Math.min(lo, n.evH.sunset);
    if (n.evH.sunrise != null) hi = Math.max(hi, n.evH.sunrise);
  }
  if (lo > hi) {
    lo = 4;
    hi = 20;
  }
  const ax = { start: Math.floor((lo - 0.3) * 2) / 2, end: Math.ceil((hi + 0.3) * 2) / 2 };

  // moon quarters and new-moon alignment
  const quarters: Quarter[] = [];
  const first = nights[0].noon,
    last = nights[nights.length - 1].noon + MS_D;
  let mq = SearchMoonQuarter(new Date(first - 20 * MS_D));
  while (mq.time.date.getTime() < last + 20 * MS_D) {
    const t = mq.time.date.getTime();
    quarters.push({ q: mq.quarter, t, i: nightIndexForTime(nights, t) });
    mq = NextMoonQuarter(mq);
  }
  for (const n of nights) n.quarter = -1;
  for (const q of quarters) if (q.i >= 0 && q.i < nights.length) nights[q.i].quarter = q.q;
  const nm = quarters.filter((q) => q.q === 0);
  const lunations: Lunation[] = nm
    .filter((q) => q.i + 7 >= 0 && q.i - 7 < nights.length)
    .map((q) => ({ t: q.t, i: q.i, best: null, total: 0 }));
  nights.forEach((n, i) => {
    let best: number | null = null;
    for (const q of nm) {
      const off = i - q.i;
      if (best == null || Math.abs(off) < Math.abs(best)) best = off;
    }
    n.nmOff = best == null ? 99 : best;
  });

  // months and weeks (Sunday first)
  const months: Month[] = [];
  const byKey = new Map<string, Month>();
  nights.forEach((n, i) => {
    const key = `${n.y}-${pad2(n.m)}`;
    let mo = byKey.get(key);
    if (!mo) {
      mo = { key, y: n.y, m: n.m, idx: [], weeks: [], total: 0, good: 0, nm: [], fm: [] };
      byKey.set(key, mo);
      months.push(mo);
    }
    mo.idx.push(i);
  });
  for (const mo of months) {
    const firstDow = nights[mo.idx[0]].dow;
    const cells = new Array<number>(firstDow).fill(-1).concat(mo.idx);
    while (cells.length % 7) cells.push(-1);
    mo.weeks = [];
    for (let k = 0; k < cells.length; k += 7) mo.weeks.push(cells.slice(k, k + 7));
  }
  const tonight = tonightId(now, tz);
  const tonightIdx = nights.findIndex((n) => n.id === tonight);
  return { site, tz, spec, nights, ax, quarters, lunations, months, maxMF: 1, tonightIdx };
}

/** Month totals, nights with at least 4 h, and the new and full moons that fall in it. */
export function monthStats(r: NightRange, mo: Month): void {
  const { nights, quarters } = r;
  let total = 0,
    good = 0;
  for (const i of mo.idx) {
    total += nights[i].mfMs;
    if (nights[i].mfMs >= 4 * MS_H) good++;
  }
  mo.total = total;
  mo.good = good;
  const first = mo.idx[0],
    last = mo.idx[mo.idx.length - 1];
  mo.nm = quarters.filter((q) => q.q === 0 && q.i >= first && q.i <= last).map((q) => q.i);
  mo.fm = quarters.filter((q) => q.q === 2 && q.i >= first && q.i <= last).map((q) => q.i);
}

/** Moon-free total within ±N nights of the new moon, and the best Friday + Saturday pair. */
export function bestWeekend(r: NightRange, L: Lunation, N: number): void {
  const { nights } = r;
  let best: WeekendPick | null = null,
    total = 0;
  for (let k = -N; k <= N; k++) {
    const i = L.i + k;
    if (i < 0 || i >= nights.length) continue;
    total += nights[i].mfMs;
    if (nights[i].dow === 5 && k + 1 <= N && i + 1 < nights.length) {
      const sum = nights[i].mfMs + nights[i + 1].mfMs;
      if (!best || sum > best.sum) best = { i, sum };
    }
  }
  L.best = best;
  L.total = total;
}

export function bestWeekends(r: NightRange, N: number): void {
  for (const L of r.lunations) bestWeekend(r, L, N);
}

/** Apply thresholds to every night, then refresh the totals that depend on them. */
export function deriveRange(r: NightRange, th: Thresholds, lunN: number): void {
  let maxMF = 1;
  for (const n of r.nights) {
    deriveNight(n, th);
    maxMF = Math.max(maxMF, n.mfMs);
  }
  r.maxMF = maxMF;
  bestWeekends(r, lunN);
  for (const mo of r.months) monthStats(r, mo);
}

/** The best Friday + Saturday within ±7 nights of each new moon, from tonight on (up to 7). */
export function weekendsAhead(r: NightRange): WeekendPick[] {
  const { nights } = r;
  const out: WeekendPick[] = [];
  const start = Math.max(0, r.tonightIdx);
  for (const L of r.lunations) {
    let best: WeekendPick | null = null;
    for (let k = -7; k <= 7; k++) {
      const i = L.i + k;
      if (i < start || i + 1 >= nights.length || nights[i].dow !== 5) continue;
      const sum = nights[i].mfMs + nights[i + 1].mfMs;
      if (!best || sum > best.sum) best = { i, sum };
    }
    if (best) out.push(best);
  }
  return out.slice(0, 7);
}

export interface ComputeOptions {
  /** Called after each slice with the number of nights done and the total. */
  onProgress?: (done: number, total: number) => void;
  /** Checked before each slice; returning true abandons the computation. */
  isCancelled?: () => boolean;
  /** Main-thread time per slice before yielding to the event loop. */
  sliceMs?: number;
}

function setup(site: Site, shift: number, now: number) {
  const tz = new TimeZone(site.tz);
  const observer = new Observer(site.lat, site.lon, site.elevation ?? 0);
  const spec = rangeStart(now, tz, shift);
  return { tz, observer, spec, list: nightDates(spec) };
}

/**
 * Compute every night of the range in short slices, yielding between them so the page
 * stays responsive. Resolves to null when cancelled.
 */
export async function computeRange(
  site: Site,
  shift: number,
  th: Thresholds,
  lunN: number,
  now: number,
  opts: ComputeOptions = {},
): Promise<NightRange | null> {
  const { tz, observer, spec, list } = setup(site, shift, now);
  const slice = opts.sliceMs ?? 24;
  const nights: Night[] = [];
  let k = 0;
  for (;;) {
    if (opts.isCancelled?.()) return null;
    const t = performance.now();
    while (k < list.length && performance.now() - t < slice) {
      const [y, m, d] = list[k];
      nights.push(computeNight(observer, tz, y, m, d));
      k++;
    }
    opts.onProgress?.(k, list.length);
    if (k >= list.length) break;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const r = buildStructures(nights, site, tz, spec, now);
  deriveRange(r, th, lunN);
  return r;
}

/** {@link computeRange} in one go, for tests and tools. */
export function computeRangeSync(
  site: Site,
  shift: number,
  th: Thresholds,
  lunN: number,
  now: number,
): NightRange {
  const { tz, observer, spec, list } = setup(site, shift, now);
  const nights = list.map(([y, m, d]) => computeNight(observer, tz, y, m, d));
  const r = buildStructures(nights, site, tz, spec, now);
  deriveRange(r, th, lunN);
  return r;
}
