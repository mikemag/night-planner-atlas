import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as model from '../model/night';
import { computeCachedNights, computeCachedRange } from './compute-cached';
import { DEFAULT_SITES } from './default-sites';
import { nightCache } from './night-cache';
import { NightMemory } from './night-memory';

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
