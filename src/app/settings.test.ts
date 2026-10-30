import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SITE, loadSettings } from './settings';

let saved: Map<string, string>;
beforeEach(() => {
  saved = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null });
});
afterEach(() => vi.unstubAllGlobals());

it('falls back safely from obsolete or malformed control values without altering storage', () => {
  const invalid = {
    view: 'table',
    focus: -5,
    moonAlt: 7,
    crescent: '0.2',
    calOrient: 'diagonal',
    calZoom: null,
    calMonthStyle: 'nautical',
    riverZoom: 'week',
  };
  for (const [key, value] of Object.entries(invalid))
    saved.set('npa:' + key, JSON.stringify(value));
  expect(loadSettings()).toEqual({
    view: 'river',
    site: DEFAULT_SITE,
    focus: 0,
    moonAlt: 0,
    crescent: 0,
    calOrient: 'v',
    calZoom: 'month',
    calMonthStyle: 'hours',
    riverZoom: 'month',
  });
  expect(saved.get('npa:moonAlt')).toBe('7');
});

it('restores the selected full favorite even if the legacy site key is older', () => {
  const site = { name: 'Saved ridge', lat: 35, lon: -110, tz: 'America/Phoenix', elevation: 2100 };
  saved.set('npa:site', JSON.stringify(DEFAULT_SITE));
  saved.set(
    'npa:favorites',
    JSON.stringify({ version: 1, sites: [{ ...site, id: 'ridge' }], selectedId: 'ridge' }),
  );
  saved.set('npa:moonAlt', '15');
  const settings = loadSettings();
  expect(settings.site).toEqual(site);
  expect(settings.site).not.toHaveProperty('id');
  expect(settings.moonAlt).toBe(15);
});

it('restores the Calendar month presentation independently of the selected period', () => {
  saved.set('npa:calMonthStyle', '"windows"');
  saved.set('npa:calZoom', '"week"');
  expect(loadSettings()).toMatchObject({ calMonthStyle: 'windows', calZoom: 'week' });
});
