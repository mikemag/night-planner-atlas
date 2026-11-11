import { expect, it } from 'vitest';
import { Observer } from 'astronomy-engine';
import { computeNight } from '../model/night';
import { TimeZone } from '../model/time';
import { DEFAULT_SITES } from './default-sites';
import { packMonth, rangeMonths } from './night-cache-format';
import { NightMemory } from './night-memory';

const site = DEFAULT_SITES[0];
const observer = new Observer(site.lat, site.lon, site.elevation ?? 0);
const tz = new TimeZone(site.tz);
const nights = [9, 10, 11].map((m) => computeNight(observer, tz, 2026, m, 1));
const bytes = Math.max(...nights.map((n) => packMonth('', [n]).bytes));

it('retains many years of monthly entries within the default byte budget', () => {
  const memory = new NightMemory();
  const saved = rangeMonths({ y: 2026, m: 1, count: 74 }).map(({ y, m }) =>
    computeNight(observer, tz, y, m, 1),
  );
  for (const night of saved) memory.put(site, night);
  for (const night of saved) expect(memory.get(site, night.id)).toBe(night);
});

it('evicts least-recently-used months by bytes and does not double-count hits or replacements', () => {
  const memory = new NightMemory(512, 2 * bytes);
  const [a, b, c] = nights;
  memory.put(site, a);
  memory.put(site, b);
  memory.get(site, a.id);
  memory.put(site, c);
  expect(memory.get(site, b.id)).toBeUndefined();
  memory.put(site, a);
  memory.put(site, { ...a });
  expect(memory.get(site, a.id)).toEqual(a);
  expect(memory.get(site, c.id)).toBe(c);
  memory.clear();
  memory.put(site, b);
  memory.put(site, c);
  expect(memory.get(site, a.id)).toBeUndefined();
  expect(memory.get(site, b.id)).toBe(b);
  expect(memory.get(site, c.id)).toBe(c);
});

it('ignores a night larger than the byte budget without evicting usable entries', () => {
  const memory = new NightMemory(512, 2 * bytes);
  memory.put(site, nights[0]);
  memory.put(site, { ...nights[1], moonAlt: new Float32Array(2 * bytes) });
  expect(memory.get(site, nights[0].id)).toBe(nights[0]);
  expect(memory.get(site, nights[1].id)).toBeUndefined();
});
