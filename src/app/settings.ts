import type { Site } from '../model/night';
import { siteRecord } from './site-book';
import { DEFAULT_SITES } from './default-sites';
import { currentSite, personal } from './personal-data';

export type ChartViewId = 'river' | 'calendar' | 'lunations';
export type ViewId = ChartViewId | 'weekends' | 'notes';
export type RiverZoom = 'year' | 'month';
export type CalZoom = 'month' | 'week' | 'year';
export type CalOrient = 'v' | 'h';
export interface Settings {
  view: ViewId;
  site: Site;
  focus: number;
  moonAlt: number;
  crescent: number;
  /** Retained for v1 share links. */
  calOrient: CalOrient;
  calZoom: CalZoom;
  riverZoom: RiverZoom;
}
export const DEFAULT_SITE: Site = siteRecord(DEFAULT_SITES[0]);
export function hasFocusPreference(): boolean {
  return personal.snapshot().preferences.focus !== undefined;
}
export function loadSettings(): Settings {
  const value = personal.snapshot(),
    p = value.preferences;
  return {
    site: currentSite(value),
    view: p.view ?? 'river',
    focus: p.focus ?? 0,
    moonAlt: p.moonAlt ?? 0,
    crescent: p.crescent ?? 0,
    calOrient: p.calOrient ?? 'v',
    calZoom: p.calZoom ?? 'month',
    riverZoom: p.riverZoom ?? 'month',
  };
}
