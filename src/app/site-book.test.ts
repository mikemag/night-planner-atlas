import { expect, it } from 'vitest';
import { isFavorite, siteRecord } from './site-book';
import { DEFAULT_SITES } from './default-sites';
import { freshPersonalData } from './personal-data';
it('starts six complete independent sites with Seattle selected', () => {
  const a = freshPersonalData();
  expect(a.sites).toHaveLength(6);
  expect(a.sites.every(isFavorite)).toBe(true);
  expect(a.active).toEqual({ id: DEFAULT_SITES[0].id });
  a.sites[0].name = 'Edited';
  a.sites.splice(1, 1);
  expect(freshPersonalData().sites).toEqual(DEFAULT_SITES);
});
it('strips storage identity from the computational site', () => {
  const site = siteRecord(DEFAULT_SITES[0]);
  expect(site).not.toHaveProperty('id');
  expect(site.elevation).toBe(122);
  expect(isFavorite(site)).toBe(false);
});
