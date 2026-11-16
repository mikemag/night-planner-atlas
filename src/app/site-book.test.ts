import { expect, it } from 'vitest';
import {
  insertSite,
  isFavorite,
  keepSharedSite,
  moveSite,
  sameLocation,
  siteRecord,
  undoSharedSite,
} from './site-book';
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
  expect(draft.sites[0]).toEqual(kept.site);
  draft.preferences.moonAlt = 15;
  draft.sites.find((site) => site.id === before.sites[0].id)!.name = 'My own name';
  draft.active = { id: before.sites[1].id };
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
  draft.sites = draft.sites.filter((site) => site.id !== DEFAULT_SITES[0].id);
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
  draft.sites.find((site) => site.id === kept.site.id)!.name = 'My saved ridge';
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

it('inserts new sites first, copies after their source, and tolerates a removed source', () => {
  const sites = freshPersonalData().sites;
  const original = structuredClone(sites);
  const addition = { ...sites[0], id: 'new' };
  const copy = { ...sites[2], id: 'copy' };
  insertSite(sites, addition);
  insertSite(sites, copy, original[2].id);
  expect(sites.map((site) => site.id)).toEqual([
    'new',
    original[0].id,
    original[1].id,
    original[2].id,
    'copy',
    original[3].id,
    original[4].id,
    original[5].id,
  ]);
  insertSite(sites, { ...addition, id: 'orphaned-copy' }, 'removed');
  expect(sites[0].id).toBe('orphaned-copy');
});

it('reorders the latest list by ID without changing records or the active site', () => {
  const draft = freshPersonalData();
  const before = structuredClone(draft);
  const id = draft.sites[2].id;
  draft.sites[0].name = 'Edited elsewhere';
  insertSite(draft.sites, { ...draft.sites[0], id: 'added-elsewhere' });
  draft.sites = draft.sites.filter((site) => site.id !== before.sites[1].id);
  expect(moveSite(draft.sites, id, -1)).toBe(true);
  expect(draft.sites.map((site) => site.id)).toEqual([
    'added-elsewhere',
    id,
    before.sites[0].id,
    ...before.sites.slice(3).map((site) => site.id),
  ]);
  expect(draft.sites[2].name).toBe('Edited elsewhere');
  expect(draft.active).toEqual(before.active);
  const moved = structuredClone(draft);
  expect(moveSite(draft.sites, 'removed', 1)).toBe(false);
  expect(moveSite(draft.sites, draft.sites[0].id, -1)).toBe(false);
  expect(draft).toEqual(moved);
});

it('Undo preserves intervening moves and additions, and reopening does not reorder known sites', () => {
  const draft = freshPersonalData();
  const received = { name: 'Ridge', lat: 45, lon: -120, tz: 'America/Los_Angeles' };
  const kept = keepSharedSite(draft, received);
  moveSite(draft.sites, kept.site.id, 1);
  moveSite(draft.sites, DEFAULT_SITES[3].id, -1);
  insertSite(draft.sites, { ...DEFAULT_SITES[0], id: 'later' });
  const ordered = structuredClone(draft.sites);
  expect(keepSharedSite(draft, { ...received, name: 'Another name' }).added).toBeNull();
  expect(draft.sites).toEqual(ordered);
  expect(undoSharedSite(draft, kept.added!)).toBe(true);
  expect(draft.sites).toEqual(ordered.filter((site) => site.id !== kept.site.id));
});
