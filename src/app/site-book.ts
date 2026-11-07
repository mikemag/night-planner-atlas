import type { Site } from '../model/night';
import { isSite } from '../model/site-input';
import type { PersonalData } from './personal-data';

export interface Favorite extends Site {
  id: string;
}
export function isFavorite(value: unknown): value is Favorite {
  return isSite(value) && 'id' in value && typeof value.id === 'string' && value.id.length > 0;
}
export function siteRecord(site: Site): Site {
  return {
    name: site.name,
    lat: site.lat,
    lon: site.lon,
    tz: site.tz,
    ...(site.elevation == null ? {} : { elevation: site.elevation }),
  };
}

/** About a metre of coordinate rounding; names and local favorite IDs are not identity. */
export function sameLocation(a: Site, b: Site): boolean {
  const longitude = Math.abs(a.lon - b.lon);
  return Math.abs(a.lat - b.lat) <= 0.00001 && Math.min(longitude, 360 - longitude) <= 0.00001;
}

/** Prefer matching calculation details when an older site book has several entries at a location. */
export function findSharedSite(sites: Favorite[], site: Site): Favorite | undefined {
  const matches = sites.filter((favorite) => sameLocation(favorite, site));
  return (
    matches.find(
      (favorite) => favorite.tz === site.tz && (favorite.elevation ?? 0) === (site.elevation ?? 0),
    ) ?? matches[0]
  );
}

export interface AddedSite {
  site: Favorite;
  previousActive: PersonalData['active'];
  previousSite: Site;
}

/** Mutate the latest locked document, reusing the reader's own site name and metadata. */
export function keepSharedSite(
  draft: PersonalData,
  site: Site,
): { site: Favorite; added: AddedSite | null } {
  const existing = findSharedSite(draft.sites, site);
  if (existing) {
    draft.active = { id: existing.id };
    return { site: existing, added: null };
  }
  const previousActive = structuredClone(draft.active);
  const previousSite = siteRecord(
    'id' in previousActive
      ? draft.sites.find((favorite) => favorite.id === previousActive.id)!
      : previousActive.site,
  );
  const favorite = { ...siteRecord(site), id: crypto.randomUUID() };
  draft.sites.push(favorite);
  draft.active = { id: favorite.id };
  return {
    site: favorite,
    added: { site: structuredClone(favorite), previousActive, previousSite },
  };
}

/** Undo only our unchanged addition, preserving subsequent site edits and active choices. */
export function undoSharedSite(draft: PersonalData, added: AddedSite): boolean {
  const current = draft.sites.find((site) => site.id === added.site.id);
  if (JSON.stringify(current) !== JSON.stringify(added.site)) return false;
  draft.sites = draft.sites.filter((site) => site.id !== added.site.id);
  if ('id' in draft.active && draft.active.id === added.site.id) {
    const previous = added.previousActive;
    draft.active =
      'id' in previous && !draft.sites.some((site) => site.id === previous.id)
        ? { site: added.previousSite }
        : previous;
  }
  return true;
}
