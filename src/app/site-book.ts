import type { Site } from '../model/night';
import { isSite } from '../model/site-input';
import { DEFAULT_SITES } from './default-sites';

export interface Favorite extends Site {
  id: string;
}
export interface SiteBook {
  version: 1;
  sites: Favorite[];
  selectedId: string | null;
  /** Last starter-list revision merged; later removals and edits are deliberate. */
  starterVersion?: number;
}

function withStarters(book: SiteBook): SiteBook {
  const sites = [...book.sites];
  for (const preset of DEFAULT_SITES)
    if (
      !sites.some(
        (site) => site.id === preset.id || (site.lat === preset.lat && site.lon === preset.lon),
      )
    )
      sites.push({ ...preset });
  return { ...book, sites, starterVersion: 1 };
}

/** Unknown or damaged storage is preserved, never replaced by a guessed migration. */
export function readSiteBook(
  raw: string | null | undefined,
  legacy: unknown = null,
): { book: SiteBook; readable: boolean; migrated: boolean } {
  const sites = isSite(legacy)
    ? [{ ...legacy, id: 'initial-site' }]
    : DEFAULT_SITES.map((site) => ({ ...site }));
  const fallback = withStarters({
    version: 1,
    sites,
    selectedId: sites[0].id,
  });
  if (raw === null) return { book: fallback, readable: true, migrated: isSite(legacy) };
  try {
    const value = JSON.parse(raw ?? '') as SiteBook;
    if (
      value.version !== 1 ||
      (value.starterVersion != null &&
        (!Number.isSafeInteger(value.starterVersion) || value.starterVersion < 0)) ||
      !Array.isArray(value.sites) ||
      !value.sites.every(
        (site) => isSite(site) && typeof site.id === 'string' && site.id.length > 0,
      ) ||
      new Set(value.sites.map((site) => site.id)).size !== value.sites.length ||
      (value.selectedId !== null && !value.sites.some((site) => site.id === value.selectedId))
    )
      return { book: fallback, readable: false, migrated: false };
    const migrated = (value.starterVersion ?? 0) < 1;
    return { book: migrated ? withStarters(value) : value, readable: true, migrated };
  } catch {
    return { book: fallback, readable: false, migrated: false };
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
