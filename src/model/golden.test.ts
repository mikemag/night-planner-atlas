import { describe, expect, it } from 'vitest';
import type { Site } from './night';
import { captureGolden, serializeGolden } from './testdata/golden';

// The golden files use the original prototype capture instant
// (Sep 23, 2026, 8 PM in Seattle), so "tonight" and the loaded range are fixed.
const NOW = Date.UTC(2026, 8, 24, 3, 0, 0);

const SITES: Array<[string, Site, number]> = [
  ['seattle', { name: 'Seattle', lat: 47.60621, lon: -122.34253, tz: 'America/Los_Angeles' }, 4],
  ['edinburgh', { name: 'Edinburgh', lat: 55.95, lon: -3.19, tz: 'Europe/London' }, 10],
  ['sydney', { name: 'Sydney', lat: -33.87, lon: 151.21, tz: 'Australia/Sydney' }, 10],
];

describe('night model matches the golden records', () => {
  for (const [name, site, every] of SITES) {
    it(`${name}: all three threshold settings and both lunation windows`, async () => {
      const text = serializeGolden(captureGolden(site, NOW), every);
      await expect(text).toMatchFileSnapshot(`./testdata/golden-${name}.json`);
    }, 30_000);
  }
});
