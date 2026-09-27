import type { Site } from '../model/night';

export type ViewId = 'river' | 'calendar' | 'lunations' | 'table' | 'notes';
export type RiverZoom = 'year' | 'month' | 'week';
export type RiverMark = 'line' | 'none';
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
  riverMark: RiverMark;
}

export const DEFAULT_SITE: Site = {
  name: 'Seattle',
  lat: 47.60621,
  lon: -122.34253,
  tz: 'America/Los_Angeles',
};

/** Per-viewer conveniences in localStorage; storage may be unavailable, so nothing depends on it. */
export const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem('npa:' + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem('npa:' + k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};

export function loadSettings(): Settings {
  return {
    view: store.get<ViewId>('view', 'river'),
    site: store.get<Site | null>('site', null) || DEFAULT_SITE,
    focus: store.get('focus', 0),
    moonAlt: store.get('moonAlt', 0),
    crescent: store.get('crescent', 0),
    calOrient: store.get<CalOrient>('calOrient', 'v'),
    calZoom: store.get<CalZoom>('calZoom', 'month'),
    riverZoom: store.get<RiverZoom>('riverZoom', 'month'),
    riverMark: store.get<RiverMark>('riverMark', 'line'),
  };
}
