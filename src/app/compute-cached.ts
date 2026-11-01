import {
  computeRange,
  rangeStart,
  RANGE_MONTHS,
  type ComputeOptions,
  type NightRange,
} from '../model/range';
import { TimeZone } from '../model/time';
import type { Night, Site, Thresholds } from '../model/night';
import { monthKey, packMonth, rangeMonths, siteKey, unpackMonth } from './night-cache-format';
import { nightCache } from './night-cache';
import { personal } from './personal-data';

export interface ComputeStats {
  cachedNights: number;
  computedNights: number;
  elapsedMs: number;
}
/** Reuse complete months, compute misses in the usual slices, and publish one complete range. */
export async function computeCachedRange(
  site: Site,
  shift: number,
  th: Thresholds,
  lunN: number,
  now: number,
  opts: ComputeOptions & { onStats?: (stats: ComputeStats) => void } = {},
): Promise<NightRange | null> {
  const started = performance.now(),
    input = { ...site },
    tz = new TimeZone(site.tz);
  const spec = opts.startMonth
    ? { ...opts.startMonth, count: RANGE_MONTHS }
    : rangeStart(now, tz, shift);
  const months = rangeMonths(spec),
    identity = siteKey(input),
    profile = personal.snapshot();
  // Temporary shared/private sites do not silently acquire a persistent coordinate record.
  const eligible = !personal.status() && profile.sites.some((s) => siteKey(s) === identity);
  const epoch = nightCache.epoch;
  const keys = months.map((m) => monthKey(input, m.y, m.m));
  const stored = eligible ? await nightCache.get(keys) : new Map<string, unknown>();
  if (opts.isCancelled?.()) return null;
  const cached = new Map<string, Night>(),
    missing = new Set<string>();
  let sliceStart = performance.now();
  for (let i = 0; i < months.length; i++) {
    if (opts.isCancelled?.()) return null;
    const m = months[i],
      nights = unpackMonth(stored.get(keys[i]), keys[i], m.y, m.m, tz);
    if (nights) for (const n of nights) cached.set(n.id, n);
    else missing.add(keys[i]);
    if (performance.now() - sliceStart >= (opts.sliceMs ?? 24)) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      sliceStart = performance.now();
    }
  }
  const range = await computeRange(input, shift, th, lunN, now, { ...opts, cachedNights: cached });
  if (!range || opts.isCancelled?.()) return null;
  opts.onStats?.({
    cachedNights: cached.size,
    computedNights: range.nights.length - cached.size,
    elapsedMs: performance.now() - started,
  });
  if (eligible && missing.size)
    setTimeout(() => {
      if (epoch !== nightCache.epoch || opts.isCancelled?.()) return;
      const records = range.months.flatMap((m) => {
        const key = monthKey(input, m.y, m.m);
        return missing.has(key)
          ? [
              packMonth(
                key,
                m.idx.map((i) => range.nights[i]),
              ),
            ]
          : [];
      });
      void nightCache.put(records, epoch);
    }, 0);
  return range;
}
