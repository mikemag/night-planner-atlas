import { expect, it } from 'vitest';
import { readSiteBook, siteRecord } from './site-book';
import { DEFAULT_SITES } from './default-sites';
import { isSite } from '../model/site-input';

const legacy = {
  name: 'My private site',
  lat: 47.2,
  lon: -122.7,
  tz: 'America/Los_Angeles',
  elevation: 2500,
};

it('starts a fresh browser with six complete public sites and Seattle selected', () => {
  const { book, readable } = readSiteBook(null);
  expect(readable).toBe(true);
  expect(book.sites).toEqual(DEFAULT_SITES);
  expect(book.sites).toHaveLength(6);
  expect(book.sites.every(isSite)).toBe(true);
  expect(book.selectedId).toBe(book.sites[0].id);
  expect(book.sites[0].name).toBe('Seattle, Paramount Park');
});

it('does not leak edits or removal from a starter list into another fresh browser', () => {
  const { book } = readSiteBook(null);
  book.sites[0].name = 'Edited site';
  book.sites.splice(1, 1);
  expect(readSiteBook(null).book.sites).toEqual(DEFAULT_SITES);
  expect(readSiteBook(JSON.stringify(book)).book).toEqual(book);
});

it('preserves the complete legacy site as the initial favorite without changing its coordinates', () => {
  const loaded = readSiteBook(null, legacy);
  expect(loaded.readable).toBe(true);
  expect(loaded.book.sites).toEqual([{ ...legacy, id: 'initial-site' }, ...DEFAULT_SITES]);
  expect(loaded.book.selectedId).toBe('initial-site');
  expect(loaded.migrated).toBe(true);
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

it('merges starter sites into an older list without changing its records or selected site', () => {
  const book = { version: 1, sites: [{ ...legacy, id: 'private' }], selectedId: 'private' };
  const loaded = readSiteBook(JSON.stringify(book), legacy);
  expect(loaded).toMatchObject({
    readable: true,
    migrated: true,
    book: { selectedId: 'private', starterVersion: 1 },
  });
  expect(loaded.book.sites).toEqual([...book.sites, ...DEFAULT_SITES]);
  expect(book.sites).toHaveLength(1);
  expect(readSiteBook(JSON.stringify(loaded.book)).migrated).toBe(false);
});

it('preserves renamed coordinate matches and edited starters without duplicating them', () => {
  const renamed = { ...DEFAULT_SITES[0], id: 'my-park', name: 'My park', elevation: 999 };
  const edited = { ...DEFAULT_SITES[1], name: 'My edited site', lat: 50 };
  const book = { version: 1, sites: [renamed, edited], selectedId: renamed.id };
  const loaded = readSiteBook(JSON.stringify(book));
  expect(loaded.book.sites).toEqual([renamed, edited, ...DEFAULT_SITES.slice(2)]);
  expect(loaded.book.selectedId).toBe(renamed.id);
});

it('merges into an old empty list once and respects subsequent deletion of every starter', () => {
  const old = readSiteBook('{"version":1,"sites":[],"selectedId":null}');
  expect(old.book.sites).toEqual(DEFAULT_SITES);
  expect(old.book.selectedId).toBeNull();
  const book = { ...old.book, sites: [] };
  expect(readSiteBook(JSON.stringify(book))).toEqual({ book, readable: true, migrated: false });
});

it('does not repeat an older migration over a later starter-list revision', () => {
  const book = { version: 1, starterVersion: 2, sites: [], selectedId: null };
  expect(readSiteBook(JSON.stringify(book))).toEqual({ book, readable: true, migrated: false });
});
