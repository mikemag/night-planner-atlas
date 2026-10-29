import type { Site } from '../model/night';
import { isSite } from '../model/site-input';
import { readSiteBook, siteRecord } from './site-book';

export type ViewId = 'river' | 'calendar' | 'lunations' | 'notes';
export type RiverZoom = 'year' | 'month';
export type CalZoom = 'month' | 'year';
export type CalOrient = 'v' | 'h';

/** Preferences remembered in this browser. */
export interface Settings {
  view: ViewId;
  site: Site;
  focus: number;
  moonAlt: number;
  crescent: number;
  calOrient: CalOrient;
  calZoom: CalZoom;
  riverZoom: RiverZoom;
}

export const DEFAULT_SITE: Site = {
  name: 'Seattle',
  lat: 47.60621,
  lon: -122.34253,
  tz: 'America/Los_Angeles',
};

/** Per-viewer conveniences in localStorage; storage may be unavailable, so nothing depends on it. */
export const store = {
  raw(k: string): string | null | undefined {
    try {
      return localStorage.getItem('npa:' + k);
    } catch {
      return undefined;
    }
  },
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem('npa:' + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown): boolean {
    try {
      localStorage.setItem('npa:' + k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
};

export function loadSettings(): Settings {
  const view = store.get<string>('view', 'river');
  const savedSite = store.get<unknown>('site', null);
  const legacy = isSite(savedSite) ? savedSite : DEFAULT_SITE;
  const { book } = readSiteBook(store.raw('favorites'), legacy);
  const site = book.sites.find((site) => site.id === book.selectedId) ?? legacy;
  return {
    view: ['river', 'calendar', 'lunations', 'notes'].includes(view) ? (view as ViewId) : 'river',
    site: siteRecord(site),
    focus: store.get('focus', 0),
    moonAlt: store.get('moonAlt', 0),
    crescent: store.get('crescent', 0),
    calOrient: store.get<CalOrient>('calOrient', 'v'),
    calZoom: store.get<CalZoom>('calZoom', 'month'),
    riverZoom: store.get<string>('riverZoom', 'month') === 'year' ? 'year' : 'month',
  };
}
