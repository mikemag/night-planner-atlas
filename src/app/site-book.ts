import type { Site } from '../model/night';
import { isSite } from '../model/site-input';

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
