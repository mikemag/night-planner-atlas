import { expect, it } from 'vitest';
import { readSiteBook, siteRecord } from './site-book';

const legacy = {
  name: 'My private site',
  lat: 47.2,
  lon: -122.7,
  tz: 'America/Los_Angeles',
  elevation: 2500,
};

it('preserves the complete legacy site as the initial favorite without changing its coordinates', () => {
  const loaded = readSiteBook(null, legacy);
  expect(loaded.readable).toBe(true);
  expect(loaded.book.sites).toEqual([{ ...legacy, id: 'initial-site' }]);
  expect(siteRecord(loaded.book.sites[0])).toEqual(legacy);
  expect(legacy).not.toHaveProperty('id');
});

it.each([
  undefined,
  '{bad json',
  '{"version":2}',
  '{"version":1,"sites":[],"selectedId":"missing"}',
  JSON.stringify({
    version: 1,
    sites: [
      { ...legacy, id: 'a' },
      { ...legacy, id: 'a' },
    ],
    selectedId: 'a',
  }),
  JSON.stringify({ version: 1, sites: [{ ...legacy, id: 'a', tz: 'unknown' }], selectedId: 'a' }),
])('marks unknown/damaged/unavailable storage as unwritable: %s', (raw) => {
  expect(readSiteBook(raw, legacy).readable).toBe(false);
});

it('restores a chosen complete record and permits an empty favorites list', () => {
  const book = { version: 1, sites: [{ ...legacy, id: 'private' }], selectedId: 'private' };
  expect(readSiteBook(JSON.stringify(book), legacy)).toEqual({ book, readable: true });
  expect(readSiteBook('{"version":1,"sites":[],"selectedId":null}', legacy).book.sites).toEqual([]);
});
