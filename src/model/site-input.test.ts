import { expect, it } from 'vitest';
import { isSite, parseSiteInput } from './site-input';

it.each([
  '47.60621, -122.34253',
  '  47.60621 \n −122.34253  ',
  '+47.60621,−122.34253',
  'https://www.google.com/maps/search/?api=1&query=47.60621%2C-122.34253&utm_source=ignored',
  'https://maps.google.com/?q=loc:47.60621,-122.34253',
  'https://www.google.co.uk/maps?q=47.60621,-122.34253',
])('reads an explicit point from %s', (input) => {
  expect(parseSiteInput(input)).toEqual({ lat: 47.60621, lon: -122.34253 });
});

it.each([
  '',
  '47.6, -122.3 extra',
  '47N 122W',
  '47.6',
  'NaN, 1',
  'Infinity, 1',
  '1e1, 2',
  'https://maps.app.goo.gl/example',
  'https://goo.gl/maps/example',
  'https://www.google.com/maps/@47.6,-122.3,14z',
  'https://www.google.com/maps?ll=47.6,-122.3',
  'https://www.google.com/maps/search/?query=Seattle',
  'https://www.google.com/maps/dir/?query=47.6,-122.3',
  'https://www.google.com/maps/search/?query=47.6,-122.3&query_place_id=other',
  'https://www.google.com/maps?query=47.6,-122.3&q=48,-123',
  'https://www.google.com/maps?query=47.6,-122.3&query=48,-123',
  'https://www.google.com.evil.example/maps?q=47.6,-122.3',
  'https://evil.example/?q=47.6,-122.3',
  'javascript:alert(1)',
])('rejects ambiguous or unsupported input without guessing: %s', (input) => {
  expect(() => parseSiteInput(input)).toThrow();
});

it('enforces the planner limits and accepts the dateline and southern coordinates', () => {
  expect(parseSiteInput('-90, 180')).toEqual({ lat: -90, lon: 180 });
  expect(parseSiteInput('90, -180')).toEqual({ lat: 90, lon: -180 });
  expect(parseSiteInput('78.148, 16.043')).toEqual({ lat: 78.148, lon: 16.043 });
  expect(() => parseSiteInput('90.01, 0')).toThrow('Latitude');
  expect(() => parseSiteInput('0, -180.01')).toThrow('Longitude');
});

it('validates complete saved records, including elevation and IANA zones', () => {
  const site = { name: 'Site', lat: 47, lon: -122, tz: 'America/Los_Angeles', elevation: -400 };
  expect(isSite(site)).toBe(true);
  for (const change of [
    { lat: '47' },
    { lon: NaN },
    { tz: 'Mars/Olympus_Mons' },
    { tz: '+02:00' },
    { elevation: 10001 },
  ])
    expect(isSite({ ...site, ...change })).toBe(false);
});
