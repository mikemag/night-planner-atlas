import {
  buildStructures,
  computeNights,
  deriveRange,
  type ComputeOptions,
  type NightRange,
  type RangeSpec,
} from '../model/range';
import { TimeZone } from '../model/time';
import type { Night, Site, Thresholds } from '../model/night';
import { monthKey, packMonth, rangeMonths, siteKey, unpackMonth } from './night-cache-format';
import { nightCache } from './night-cache';
import { personal } from './personal-data';
import { NightMemory } from './night-memory';

const memory = new NightMemory();
let memoryEpoch = nightCache.epoch;
/** Counts actual ephemeris work across both charts and live status; exposed by the test hooks. */
export const calculationTotals = { nights: 0 };

export interface ComputeStats {
  cachedNights: number;
  computedNights: number;
  elapsedMs: number;
}
type CachedOptions = Omit<ComputeOptions, 'spec' | 'cachedNights'> & {
  onStats?: (stats: ComputeStats) => void;
};

/** One acquisition path for the charts and live status; only missing nights do ephemeris work. */
export async function computeCachedNights(
  site: Site,
  spec: RangeSpec,
  opts: CachedOptions = {},
): Promise<Night[] | null> {
  const started = performance.now(),
    input = { ...site },
    tz = new TimeZone(site.tz);
  const months = rangeMonths(spec),
    identity = siteKey(input),
    profile = personal.snapshot();
  // Temporary shared/private sites do not silently acquire a persistent coordinate record.
  const eligible = !personal.status() && profile.sites.some((s) => siteKey(s) === identity);
  const epoch = nightCache.epoch;
  if (memoryEpoch !== epoch) {
    memory.clear();
    memoryEpoch = epoch;
  }
  const keys = months.map((m) => monthKey(input, m.y, m.m));
  const needed = months.flatMap((m, i) => (memory.hasMonth(input, m.y, m.m) ? [] : [keys[i]]));
  const stored =
    eligible && needed.length ? await nightCache.get(needed) : new Map<string, unknown>();
  if (opts.isCancelled?.()) return null;
  const cached = new Map<string, Night>(),
    missing = new Set<string>();
  let sliceStart = performance.now();
  for (let i = 0; i < months.length; i++) {
    if (opts.isCancelled?.()) return null;
    if (memory.hasMonth(input, months[i].y, months[i].m)) continue;
    const m = months[i],
      nights = unpackMonth(stored.get(keys[i]), keys[i], m.y, m.m, tz);
    if (nights) for (const n of nights) cached.set(n.id, n);
    else missing.add(keys[i]);
    if (performance.now() - sliceStart >= (opts.sliceMs ?? 24)) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      sliceStart = performance.now();
    }
  }
  let computed = 0;
  const nights = await computeNights(input, spec, {
    ...opts,
    cachedNights: { get: (id) => memory.get(input, id) ?? cached.get(id) },
    onNight: (night, fresh) => {
      if (fresh) {
        computed++;
        calculationTotals.nights++;
      }
      if (epoch === nightCache.epoch) memory.put(input, night);
      opts.onNight?.(night, fresh);
    },
  });
  if (!nights || opts.isCancelled?.()) return null;
  opts.onStats?.({
    cachedNights: nights.length - computed,
    computedNights: computed,
    elapsedMs: performance.now() - started,
  });
  if (eligible && missing.size)
    setTimeout(() => {
      if (epoch !== nightCache.epoch || opts.isCancelled?.()) return;
      const records = months.flatMap((m) => {
        const key = monthKey(input, m.y, m.m);
        return missing.has(key)
          ? [
              packMonth(
                key,
                nights.filter((n) => n.y === m.y && n.m === m.m),
              ),
            ]
          : [];
      });
      void nightCache.put(records, epoch);
    }, 0);
  return nights;
}

/** Build the chart's structures from the same nights used by the live status. */
export async function computeCachedRange(
  site: Site,
  spec: RangeSpec,
  th: Thresholds,
  lunN: number,
  now: number,
  opts: CachedOptions = {},
): Promise<NightRange | null> {
  const input = { ...site };
  const nights = await computeCachedNights(input, spec, opts);
  if (!nights || opts.isCancelled?.()) return null;
  const range = buildStructures(nights, input, nights[0].tz, spec, now);
  deriveRange(range, th, lunN);
  return range;
}
