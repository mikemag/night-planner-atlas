import {
  buildStructures,
  deriveRange,
  summarizeRange,
  nightDates,
  type ComputeOptions,
  type NightRange,
  type RangeSpec,
} from '../model/range';
import { TimeZone } from '../model/time';
import {
  deriveNight,
  type Night,
  type SolarNight,
  type Site,
  type Thresholds,
} from '../model/night';
import { monthKey, packMonth, rangeMonths, siteKey, unpackMonth } from './night-cache-format';
import { nightCache } from './night-cache';
import { personal } from './personal-data';
import { NightMemory } from './night-memory';
import { backgroundNights } from './compute-background';
import { pad2 } from '../model/format';

const memory = new NightMemory();
let memoryEpoch = nightCache.epoch;
/** Counts actual ephemeris work across both charts and live status; exposed by the test hooks. */
export const calculationTotals = { nights: 0 };

export interface ComputeStats {
  cachedNights: number;
  computedNights: number;
  elapsedMs: number;
  firstMonthMs?: number;
}
type CachedOptions = Omit<ComputeOptions, 'spec' | 'cachedNights'> & {
  onStats?: (stats: ComputeStats) => void;
  priorityMonth?: () => string | null;
  onPrepared?: (
    solar: Map<string, SolarNight>,
    available: (id: string) => Night | undefined,
  ) => void;
  onMonth?: (nights: Night[]) => void;
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
  // Pin this request's memory hits before awaiting storage or refilling the shared LRU.
  // Otherwise loading older disk months can evict later hits that we did not fetch.
  const cached = new Map<string, Night>();
  const needed = months.flatMap((m, i) => {
    for (const [y, month, d] of nightDates({ ...m, count: 1 })) {
      const night = memory.get(input, `${y}-${pad2(month)}-${pad2(d)}`);
      if (night) cached.set(night.id, night);
    }
    return memory.hasMonth(input, m.y, m.m) ? [] : [keys[i]];
  });
  const stored =
    eligible && needed.length ? await nightCache.get(needed) : new Map<string, unknown>();
  if (opts.isCancelled?.()) return null;
  const missing = new Set<string>();
  let sliceStart = performance.now();
  for (let i = 0; i < months.length; i++) {
    if (opts.isCancelled?.()) return null;
    if (!needed.includes(keys[i])) continue;
    const m = months[i],
      nights = unpackMonth(stored.get(keys[i]), keys[i], m.y, m.m, tz);
    if (nights) for (const n of nights) cached.set(n.id, n);
    else missing.add(keys[i]);
    if (performance.now() - sliceStart >= (opts.sliceMs ?? 24)) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      sliceStart = performance.now();
    }
  }
  const available = (id: string) => memory.get(input, id) ?? cached.get(id);
  // A complete cache hit needs one final publication, with no intermediate geometry or layouts.
  const progressive = missing.size > 0;
  const solar =
    opts.onPrepared && progressive
      ? await backgroundNights.prepare(input, spec, { ...opts, cachedNights: { get: available } })
      : undefined;
  if (opts.isCancelled?.() || solar === null) return null;
  if (solar) opts.onPrepared?.(solar, available);
  let computed = 0;
  let firstMonthMs: number | undefined;
  const computeOptions = {
    ...opts,
    solarNights: solar,
    cachedNights: { get: available },
    onNight: (night: Night, fresh: boolean) => {
      if (fresh) {
        computed++;
        calculationTotals.nights++;
      }
      if (epoch === nightCache.epoch) memory.put(input, night);
      opts.onNight?.(night, fresh);
    },
  };
  let nights: Night[] | null;
  if (opts.onMonth && progressive) {
    const remaining = months.map((m, i) => ({ ...m, i }));
    const found = new Map<string, Night>();
    const total = nightDates(spec).length;
    while (remaining.length) {
      if (opts.isCancelled?.()) return null;
      const priority = opts.priorityMonth?.();
      const index = Math.max(
        0,
        months.findIndex((m) => `${m.y}-${String(m.m).padStart(2, '0')}` === priority),
      );
      remaining.sort((a, b) => Math.abs(a.i - index) - Math.abs(b.i - index) || a.i - b.i);
      const month = remaining.shift()!;
      const rows = await backgroundNights.compute(
        input,
        { ...month, count: 1 },
        {
          ...computeOptions,
          onProgress: (done) => opts.onProgress?.(found.size + done, total),
        },
      );
      if (!rows || opts.isCancelled?.()) return null;
      for (const n of rows) found.set(n.id, n);
      firstMonthMs ??= performance.now() - started;
      opts.onMonth(rows);
      // Include publication/layout work in the budget across cached month jobs. Awaiting an
      // already-resolved computation only yields to microtasks, not input or painting.
      if (remaining.length && performance.now() - sliceStart >= (opts.sliceMs ?? 24)) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        sliceStart = performance.now();
      }
    }
    nights = [...found.values()].sort((a, b) => a.noon - b.noon);
  } else nights = await backgroundNights.compute(input, spec, computeOptions);
  if (!nights || opts.isCancelled?.()) return null;
  opts.onStats?.({
    cachedNights: nights.length - computed,
    computedNights: computed,
    elapsedMs: performance.now() - started,
    ...(firstMonthMs == null ? {} : { firstMonthMs }),
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

/** Geometry only. Its ID remains pending until a complete night replaces it. */
function pendingNight(solar: SolarNight): Night {
  return {
    ...solar,
    S0: solar.noon,
    moonAlt: new Float32Array(),
    moonlight: new Float32Array(),
    sunAlt: new Float32Array(),
    moonWindows: {},
    illum: 0,
    phase: 0,
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
}

/** Build shared chart structures; read the supplied thresholds again as months arrive. */
export async function computeCachedRange(
  site: Site,
  spec: RangeSpec,
  th: Thresholds,
  lunN: number,
  now: number,
  opts: CachedOptions & { onPartial?: (range: NightRange, pending: Set<string>) => void } = {},
): Promise<NightRange | null> {
  const input = { ...site };
  let partial: NightRange | null = null;
  const pending = new Set<string>();
  let published = false;
  let derivedThresholds: Thresholds | null = null;
  const refreshThresholds = (range: NightRange) => {
    if (derivedThresholds?.moonAlt === th.moonAlt && derivedThresholds?.crescent === th.crescent)
      return;
    for (const n of range.nights) if (!pending.has(n.id)) deriveNight(n, th);
    derivedThresholds = { moonAlt: th.moonAlt, crescent: th.crescent };
  };
  const nights = await computeCachedNights(input, spec, {
    ...opts,
    ...(opts.onPartial
      ? {
          onPrepared: (
            solar: Map<string, SolarNight>,
            available: (id: string) => Night | undefined,
          ) => {
            const rows = [...solar.values()]
              .sort((a, b) => a.noon - b.noon)
              .map((n) => {
                const cached = available(n.id);
                if (cached) return cached;
                pending.add(n.id);
                return pendingNight(n);
              });
            partial = buildStructures(rows, input, rows[0].tz, spec, now);
          },
          onMonth: (rows: Night[]) => {
            if (!partial) return;
            refreshThresholds(partial);
            let changed = false;
            for (const n of rows) {
              if (!pending.delete(n.id)) continue;
              changed = true;
              const i = partial.nights.findIndex((old) => old.id === n.id);
              const old = partial.nights[i];
              n.nmOff = old.nmOff;
              n.quarter = old.quarter;
              deriveNight(n, th);
              partial.nights[i] = n;
            }
            if (!published || changed) {
              published = true;
              opts.onPartial!(partial, pending);
            }
            opts.onMonth?.(rows);
          },
        }
      : {}),
  });
  if (!nights || opts.isCancelled?.()) return null;
  const range = partial ?? buildStructures(nights, input, nights[0].tz, spec, now);
  if (partial) {
    refreshThresholds(range);
    summarizeRange(range, lunN);
  } else deriveRange(range, th, lunN);
  return range;
}
