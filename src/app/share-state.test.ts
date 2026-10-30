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
  expect(url.hash).toContain('#npa=1&view=river&start=2026-09&night=2026-10-31');
  expect(url.hash).toContain('crescent=20');
  expect(url.hash).not.toMatch(/%7B|%22|%3A|%2C|riverZoom|calZoom|calOrient/);
  expect(readSharedPlan(url.hash)).toEqual(plan);
  expect(JSON.stringify(readSharedPlan(url.hash))).not.toMatch(/lat|lon|tz|Seattle/);
});

it('keeps default plans short and preserves every nondefault view option', () => {
  const defaults: SharedPlan = {
    ...plan,
    focus: 0,
    moonAlt: 0,
    crescent: 0,
    expanded: false,
    night: null,
  };
  const short = new URL(createShareLink('https://example.test/', defaults));
  expect(short.hash).toBe('#npa=1&view=river&start=2026-09');
  expect(readSharedPlan(short.hash)).toEqual(defaults);
  const changed: SharedPlan = {
    ...defaults,
    view: 'calendar',
    riverZoom: 'year',
    calZoom: 'year',
    calOrient: 'h',
    night: '2026-11-01',
  };
  expect(readSharedPlan(new URL(createShareLink('https://example.test/', changed)).hash)).toEqual(
    changed,
  );
});

it('reads the original JSON link format', () => {
  expect(readSharedPlan(hash(plan))).toEqual(plan);
});

it('shares an expanded Lunations night independently of River zoom', () => {
  const lunation: SharedPlan = { ...plan, view: 'lunations', riverZoom: 'year', focus: 3 };
  const url = new URL(createShareLink('https://example.test/', lunation));
  expect(readSharedPlan(url.hash)).toEqual(lunation);
  expect(() => readSharedPlan(hash({ ...lunation, view: 'calendar' }))).toThrow();
});

it('round-trips names and precise site coordinates while keeping IANA zones readable', () => {
  const withSite = {
    ...plan,
    site: {
      name: '山 & Ridge + 50% / south',
      lat: 1e-8,
      lon: -122.123456789,
      tz: 'America/Los_Angeles',
      elevation: -400,
    },
  };
  const url = new URL(createShareLink('https://example.test/', withSite));
  expect(url.hash).toContain('tz=America/Los_Angeles');
  expect(readSharedPlan(url.hash)).toEqual(withSite);
  expect(url.search).toBe('');
});

it.each([
  'npa=2&start=2026-09',
  'npa=1&start=2026-09&focus=5&focus=3',
  'npa=1&start=2026-09&focus=bad',
  'npa=1&start=2026-09&moonAlt=',
  'npa=1&start=2026-09&crescent=200',
  'npa=1&start=2026-09&expanded=2',
  'npa=1&start=2026-09&lat=47&lon=-122',
  'npa=1&start=2026-09&elevation=5',
  'npa=1&start=2026-09&night=2027-02-29',
  'npa=1&start=2026-09&view=table',
])('refuses ambiguous or invalid readable links: %s', (fragment) => {
  expect(() => readSharedPlan('#' + fragment)).toThrow('saved settings were not changed');
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
