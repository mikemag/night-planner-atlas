import { expect, it } from 'vitest';
import { createShareLink, readSharedPlan, type SharedPlan } from './share-state';

const plan: SharedPlan = {
  v: 1,
  start: '2026-09',
  view: 'river',
  riverZoom: 'month',
  calZoom: 'month',
  calOrient: 'v',
  focus: 5,
  moonAlt: 10,
  crescent: 0.2,
  night: '2026-10-31',
  expanded: true,
};
const hash = (value: unknown) => '#npa=' + encodeURIComponent(JSON.stringify(value));

it('round-trips local evening dates and loaded months without the private site or unrelated URL data', () => {
  const url = new URL(createShareLink('https://example.test/planner/?tracking=old#other', plan));
  expect(url.search).toBe('');
  expect(readSharedPlan(url.hash)).toEqual(plan);
  expect(JSON.stringify(readSharedPlan(url.hash))).not.toMatch(/lat|lon|tz|Seattle/);
});

it('only includes reviewed site fields and ignores unknown top-level fields', () => {
  const site = {
    name: 'Private ridge',
    lat: -33.87,
    lon: 151.21,
    tz: 'Australia/Sydney',
    elevation: 2000,
    id: 'local-id',
    tracking: 'discard-me',
  };
  const clean = readSharedPlan(hash({ ...plan, site, unexpected: { site } }))!;
  expect(clean.site).toEqual({
    name: site.name,
    lat: site.lat,
    lon: site.lon,
    tz: site.tz,
    elevation: site.elevation,
  });
  expect(clean).not.toHaveProperty('unexpected');
  expect(JSON.stringify(clean)).not.toMatch(/local-id|discard-me/);
});

it.each([
  null,
  [],
  { ...plan, v: 0 },
  { ...plan, view: 'table' },
  { ...plan, moonAlt: 6 },
  { ...plan, crescent: -1 },
  { ...plan, focus: 10000 },
  { ...plan, start: '2026-13' },
  { ...plan, start: '0000-01' },
  { ...plan, start: '9999-01' },
  { ...plan, night: '2027-02-29' },
  { ...plan, night: '2027-11-01' },
  { ...plan, night: '2026-08-31' },
  { ...plan, expanded: true, riverZoom: 'year' },
  { ...plan, expanded: true, night: null },
  { ...plan, site: { name: 'Private ridge', lat: 66, lon: 0, tz: 'Etc/UTC' } },
  { ...plan, site: { name: 'Private ridge', lat: 0, lon: 0, tz: 'Mars/Olympus_Mons' } },
])('refuses malformed or obsolete shared state without echoing private input: %j', (value) => {
  expect(() => readSharedPlan(hash(value))).toThrow('saved settings were not changed');
  try {
    readSharedPlan(hash(value));
  } catch (error) {
    expect((error as Error).message).not.toContain('Private ridge');
  }
});

it('handles ordinary guide anchors, bad encoding and oversized input', () => {
  expect(readSharedPlan('#accuracy')).toBeNull();
  expect(() => readSharedPlan('#npa=%not-encoded')).toThrow();
  expect(() => readSharedPlan('#npa=' + 'a'.repeat(8192))).toThrow();
});

it('validates leap days without using the viewer zone', () => {
  expect(readSharedPlan(hash({ ...plan, start: '2028-02', night: '2028-02-29' }))!.night).toBe(
    '2028-02-29',
  );
});
