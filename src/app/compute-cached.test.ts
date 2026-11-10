import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as model from '../model/night';
import * as rangeModel from '../model/range';
import { computeCachedNights, computeCachedRange } from './compute-cached';
import { DEFAULT_SITES } from './default-sites';
import { nightCache } from './night-cache';
import { NightMemory } from './night-memory';
import { monthKey, packMonth, rangeMonths } from './night-cache-format';
import { personal } from './personal-data';

const site = DEFAULT_SITES[0];
const spec = { y: 2026, m: 10, count: 1 };
const th = { moonAlt: 0, crescent: 0 };
const now = Date.parse('2026-10-28T22:00:00Z');

beforeEach(async () => {
  await nightCache.clear();
});
afterEach(() => vi.restoreAllMocks());

it('shares the chart nights with live consumers even without persistent storage', async () => {
  const compute = vi.spyOn(model, 'computeNight');
  const range = (await computeCachedRange(site, spec, th, 15, now))!;
  const live = (await computeCachedNights(site, spec))!;
  expect(compute).toHaveBeenCalledTimes(31);
  expect(live).toEqual(range.nights);
  expect(live[0]).toBe(range.nights[0]);
});

it('overlapping in-flight chart and status requests calculate each night once', async () => {
  const compute = vi.spyOn(model, 'computeNight');
  const [live, range] = await Promise.all([
    computeCachedNights(site, spec, { sliceMs: 1 }),
    computeCachedRange(site, spec, th, 15, now, { sliceMs: 1 }),
  ]);
  expect(compute).toHaveBeenCalledTimes(31);
  expect(live![0]).toBe(range!.nights[0]);
  expect(live!.at(-1)).toBe(range!.nights.at(-1));
});

it('keeps completed nights from a cancelled request and only computes the remainder', async () => {
  const compute = vi.spyOn(model, 'computeNight');
  let cancelled = false;
  const stopped = await computeCachedNights(site, spec, {
    sliceMs: 1,
    isCancelled: () => cancelled,
    onProgress: () => {
      cancelled = true;
    },
  });
  expect(stopped).toBeNull();
  expect(compute.mock.calls.length).toBeGreaterThan(0);
  expect(compute.mock.calls.length).toBeLessThan(31);
  await computeCachedNights(site, spec);
  expect(compute).toHaveBeenCalledTimes(31);
});

it('invalidates memory on an explicit cache clear and separates physical inputs', async () => {
  const compute = vi.spyOn(model, 'computeNight');
  await computeCachedNights(site, spec);
  await computeCachedNights({ ...site, name: 'Renamed' }, spec);
  expect(compute).toHaveBeenCalledTimes(31);
  await nightCache.clear();
  await computeCachedNights(site, spec);
  expect(compute).toHaveBeenCalledTimes(62);
  await computeCachedNights({ ...site, elevation: 2000 }, spec);
  expect(compute).toHaveBeenCalledTimes(93);
});

it('bounds memory by recently used months', async () => {
  const nights = (await computeCachedNights(site, { y: 2026, m: 9, count: 3 }))!;
  const memory = new NightMemory(2);
  for (const n of nights.filter((n) => n.m === 9 || n.m === 10)) memory.put(site, n);
  expect(memory.hasMonth(site, 2026, 9)).toBe(true);
  memory.get(site, '2026-09-01');
  memory.put(
    site,
    nights.find((n) => n.id === '2026-11-01')!,
  );
  expect(memory.get(site, '2026-10-01')).toBeUndefined();
  expect(memory.get(site, '2026-09-01')).toBeDefined();
  expect(memory.hasMonth(site, 2026, 11)).toBe(false);
});

it('publishes the requested month first with complete, stable date/solar geometry', async () => {
  let priority = '2026-10';
  const order: string[] = [];
  const prepared: Array<{ ax: unknown; alignment: number[] }> = [];
  const complete = new Set<string>();
  const range = await computeCachedRange(site, { y: 2026, m: 9, count: 4 }, th, 15, now, {
    priorityMonth: () => priority,
    onPartial: (range, pending) => {
      const loaded = range.months.filter((m) =>
        m.idx.every((i) => !pending.has(range.nights[i].id)),
      );
      const fresh = loaded.find((m) => !complete.has(m.key))!;
      order.push(fresh.key);
      complete.add(fresh.key);
      priority = '2026-12';
      prepared.push({ ax: { ...range.ax }, alignment: range.nights.map((n) => n.nmOff) });
      expect(range.nights).toHaveLength(122);
      for (const n of range.nights) {
        if (pending.has(n.id)) expect(n.moonAlt.length).toBe(0);
        else expect(n.moonAlt.length).toBeGreaterThan(0);
      }
    },
  });
  expect(order).toEqual(['2026-10', '2026-12', '2026-11', '2026-09']);
  for (const snapshot of prepared) {
    expect(snapshot.ax).toEqual(range!.ax);
    expect(snapshot.alignment).toEqual(range!.nights.map((n) => n.nmOff));
  }
});

it('cancels progressive loading after a month and reuses its completed nights', async () => {
  const compute = vi.spyOn(model, 'computeNight');
  let cancelled = false;
  const spec = { y: 2026, m: 9, count: 3 };
  expect(
    await computeCachedRange(site, spec, th, 15, now, {
      priorityMonth: () => '2026-10',
      isCancelled: () => cancelled,
      onPartial: () => {
        cancelled = true;
      },
    }),
  ).toBeNull();
  expect(compute).toHaveBeenCalledTimes(31);
  await computeCachedNights(site, spec);
  expect(compute).toHaveBeenCalledTimes(91);
});

it.each(['memory', 'persistent'])('publishes a fully %s-cached range only once', async (source) => {
  const spec = { y: 2026, m: 9, count: 3 };
  const nights = (await computeCachedNights(site, spec))!;
  if (source === 'persistent') {
    const stored = new Map(
      rangeMonths(spec).map(({ y, m }) => {
        const key = monthKey(site, y, m);
        return [
          key,
          packMonth(
            key,
            nights.filter((n) => n.y === y && n.m === m),
          ),
        ];
      }),
    );
    await nightCache.clear();
    vi.spyOn(personal, 'status').mockReturnValue(null);
    vi.spyOn(nightCache, 'get').mockResolvedValue(stored);
  }
  const compute = vi.spyOn(model, 'computeNight');
  const solar = vi.spyOn(model, 'computeSolarNight');
  const derive = vi.spyOn(model, 'deriveNight');
  const structures = vi.spyOn(rangeModel, 'buildStructures');
  const onPartial = vi.fn();
  const onStats = vi.fn();
  const range = await computeCachedRange(site, spec, th, 15, now, { onPartial, onStats });
  expect(range!.nights).toHaveLength(91);
  expect(onPartial).not.toHaveBeenCalled();
  expect(compute).not.toHaveBeenCalled();
  expect(solar).not.toHaveBeenCalled();
  expect(derive).toHaveBeenCalledTimes(91);
  expect(structures).toHaveBeenCalledOnce();
  expect(onStats).toHaveBeenCalledWith(
    expect.objectContaining({ cachedNights: 91, computedNights: 0 }),
  );
});

it('reuses progressive structures and derives each arriving night once', async () => {
  const derive = vi.spyOn(model, 'deriveNight');
  const structures = vi.spyOn(rangeModel, 'buildStructures');
  const partials: rangeModel.NightRange[] = [];
  const range = await computeCachedRange(site, { y: 2026, m: 9, count: 3 }, th, 15, now, {
    onPartial: (range) => partials.push(range),
  });
  expect(partials).toHaveLength(3);
  expect(partials.every((partial) => partial === range)).toBe(true);
  expect(derive).toHaveBeenCalledTimes(91);
  expect(structures).toHaveBeenCalledOnce();
  expect(range!.maxMF).toBe(Math.max(...range!.nights.map((n) => n.mfMs)));
  for (const month of range!.months)
    expect(month.total).toBe(month.idx.reduce((sum, i) => sum + range!.nights[i].mfMs, 0));
});

it('yields after publication work so input can cancel a run of cached months', async () => {
  await computeCachedNights(site, { y: 2026, m: 10, count: 2 });
  let elapsed = 0,
    cancelled = false;
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  const onPartial = vi.fn(() => {
    // Simulate an expensive publication; the queued input must run before the next month.
    elapsed += 25;
    setTimeout(() => {
      cancelled = true;
    }, 0);
  });
  const range = await computeCachedRange(site, { y: 2026, m: 10, count: 3 }, th, 15, now, {
    isCancelled: () => cancelled,
    onPartial,
  });
  expect(range).toBeNull();
  expect(onPartial).toHaveBeenCalledOnce();
});

it('keeps cached and arriving nights on the current thresholds, including a final change', async () => {
  await computeCachedNights(site, spec);
  const current = { ...th };
  const range = (await computeCachedRange(site, { ...spec, count: 3 }, current, 15, now, {
    onPartial: (_, pending) => {
      current.moonAlt = 5;
      current.crescent = pending.size ? 0.2 : 0.3;
    },
  }))!;
  for (const night of range.nights) {
    const expected = { ...night };
    model.deriveNight(expected, current);
    expect(night.mf).toEqual(expected.mf);
    expect(night.moonUp).toEqual(expected.moonUp);
    expect(night.moonIgnored).toBe(expected.moonIgnored);
  }
});
