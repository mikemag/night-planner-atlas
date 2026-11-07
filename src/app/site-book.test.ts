import { expect, it } from 'vitest';
import { isFavorite, keepSharedSite, sameLocation, siteRecord, undoSharedSite } from './site-book';
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

it('reuses a location with a different name and rounded coordinates without overwriting saved details', () => {
  const draft = freshPersonalData();
  const saved = structuredClone(draft.sites[0]);
  const kept = keepSharedSite(draft, {
    ...saved,
    name: 'A different shared name',
    lat: saved.lat + 0.000004,
    elevation: 999,
  });
  expect(kept).toEqual({ site: saved, added: null });
  expect(draft.sites).toHaveLength(6);
  expect(draft.sites[0]).toEqual(saved);
  expect(sameLocation(saved, { ...saved, lon: saved.lon + 0.01 })).toBe(false);
  expect(sameLocation({ ...saved, lon: 180 }, { ...saved, lon: -180 })).toBe(true);
});

it('undoes only the added site while preserving later preferences, site edits and selection', () => {
  const draft = freshPersonalData();
  const before = structuredClone(draft);
  const kept = keepSharedSite(draft, {
    name: 'Example',
    lat: 45,
    lon: -120,
    tz: 'America/Los_Angeles',
  });
  expect(kept.added).not.toBeNull();
  draft.preferences.moonAlt = 15;
  draft.sites[0].name = 'My own name';
  draft.active = { id: draft.sites[1].id };
  expect(undoSharedSite(draft, kept.added!)).toBe(true);
  expect(draft.sites).toHaveLength(before.sites.length);
  expect(draft.sites[0].name).toBe('My own name');
  expect(draft.preferences.moonAlt).toBe(15);
  expect(draft.active).toEqual({ id: draft.sites[1].id });
  expect(undoSharedSite(draft, kept.added!)).toBe(false);
});

it('restores prior activation on Undo without resurrecting a removed favorite', () => {
  const draft = freshPersonalData();
  const previous = siteRecord(draft.sites[0]);
  const kept = keepSharedSite(draft, {
    name: 'Example',
    lat: 45,
    lon: -120,
    tz: 'America/Los_Angeles',
  });
  draft.sites.shift();
  expect(undoSharedSite(draft, kept.added!)).toBe(true);
  expect(draft.active).toEqual({ site: previous });
  expect(draft.sites).toHaveLength(5);
});

it('keeps a newly added favorite if it has since been edited', () => {
  const draft = freshPersonalData();
  const kept = keepSharedSite(draft, {
    name: 'Example',
    lat: 45,
    lon: -120,
    tz: 'America/Los_Angeles',
  });
  draft.sites.at(-1)!.name = 'My saved ridge';
  const before = structuredClone(draft);
  expect(undoSharedSite(draft, kept.added!)).toBe(false);
  expect(draft).toEqual(before);
});

it('prefers matching calculation details among pre-existing favorites at the same location', () => {
  const draft = freshPersonalData();
  const site = { ...draft.sites[0], id: 'alternate', name: 'Another saved name', elevation: 999 };
  draft.sites.push(site);
  const kept = keepSharedSite(draft, { ...site, name: 'A shared name' });
  expect(kept.site).toEqual(site);
  expect(kept.added).toBeNull();
  expect(draft.sites).toHaveLength(7);
  expect(draft.active).toEqual({ id: 'alternate' });
});
it('strips storage identity from the computational site', () => {
  const site = siteRecord(DEFAULT_SITES[0]);
  expect(site).not.toHaveProperty('id');
  expect(site.elevation).toBe(122);
  expect(isFavorite(site)).toBe(false);
});
