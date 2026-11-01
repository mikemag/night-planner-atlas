import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SITE, hasFocusPreference, loadSettings } from './settings';
import { freshPersonalData, PERSONAL_KEY } from './personal-data';
let saved: Map<string, string>;
beforeEach(() => {
  saved = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null });
});
afterEach(() => vi.unstubAllGlobals());
it('uses fresh elevated Seattle defaults and ignores all former storage', () => {
  saved.set('npa:site', JSON.stringify({ name: 'Old', lat: 0, lon: 0, tz: 'UTC' }));
  saved.set('npa:view', '"calendar"');
  expect(loadSettings()).toMatchObject({ site: DEFAULT_SITE, view: 'river', riverZoom: 'month' });
  expect(hasFocusPreference()).toBe(false);
  expect(saved.size).toBe(2);
});
it('loads a complete saved favorite and keeps unset focus distinct from Off', () => {
  const data = freshPersonalData();
  data.sites[0].elevation = 2100;
  data.preferences = { moonAlt: 15, focus: 0 };
  saved.set(PERSONAL_KEY, JSON.stringify(data));
  expect(loadSettings().site.elevation).toBe(2100);
  expect(loadSettings().site).not.toHaveProperty('id');
  expect(loadSettings().moonAlt).toBe(15);
  expect(hasFocusPreference()).toBe(true);
});
it('uses a current unsaved site when the active favorite was removed', () => {
  const data = freshPersonalData();
  data.active = { site: { name: 'Current', lat: 35, lon: -110, tz: 'America/Phoenix' } };
  data.sites = [];
  saved.set(PERSONAL_KEY, JSON.stringify(data));
  expect(loadSettings().site.name).toBe('Current');
});
it('leaves invalid or future personal data untouched', () => {
  const raw = JSON.stringify({ ...freshPersonalData(), version: 2 });
  saved.set(PERSONAL_KEY, raw);
  expect(loadSettings().site).toEqual(DEFAULT_SITE);
  expect(saved.get(PERSONAL_KEY)).toBe(raw);
});
