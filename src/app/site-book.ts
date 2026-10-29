import type { Site } from '../model/night';
import { isSite } from '../model/site-input';

export interface Favorite extends Site {
  id: string;
}
export interface SiteBook {
  version: 1;
  sites: Favorite[];
  selectedId: string | null;
}

/** Unknown or damaged storage is preserved, never replaced by a guessed migration. */
export function readSiteBook(
  raw: string | null | undefined,
  legacy: Site,
): { book: SiteBook; readable: boolean } {
  const fallback: SiteBook = {
    version: 1,
    sites: [{ ...legacy, id: 'initial-site' }],
    selectedId: 'initial-site',
  };
  if (raw === null) return { book: fallback, readable: true };
  try {
    const value = JSON.parse(raw ?? '') as SiteBook;
    if (
      value.version !== 1 ||
      !Array.isArray(value.sites) ||
      !value.sites.every(
        (site) => isSite(site) && typeof site.id === 'string' && site.id.length > 0,
      ) ||
      new Set(value.sites.map((site) => site.id)).size !== value.sites.length ||
      (value.selectedId !== null && !value.sites.some((site) => site.id === value.selectedId))
    )
      return { book: fallback, readable: false };
    return { book: value, readable: true };
  } catch {
    return { book: fallback, readable: false };
  }
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
