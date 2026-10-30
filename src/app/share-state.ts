import type { Site } from '../model/night';
import { isSite } from '../model/site-input';
import type { Settings } from './settings';
import { siteRecord } from './site-book';

export interface SharedPlan extends Omit<Settings, 'site'> {
  v: 1;
  /** First of the 14 loaded months, independent of when the link is opened. */
  start: string;
  night: string | null;
  expanded: boolean;
  site?: Site;
}

const PREFIX = '#npa=';
// These defaults belong to this link version, independent of personal/app defaults.
const DEFAULTS = {
  view: 'river',
  riverZoom: 'month',
  calZoom: 'month',
  calOrient: 'v',
  focus: 0,
  moonAlt: 0,
  crescent: 0,
} as const;
const INVALID =
  'This shared plan is invalid or uses an unsupported version. Your saved settings were not changed.';
const among = <T extends string | number>(value: unknown, choices: readonly T[]): value is T =>
  choices.some((choice) => choice === value);

function validate(value: unknown): SharedPlan {
  if (!value || typeof value !== 'object') throw new Error(INVALID);
  const p = value as Record<string, unknown>;
  if (
    p.v !== 1 ||
    typeof p.start !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.start) ||
    !among(p.view, ['river', 'calendar', 'lunations', 'notes'] as const) ||
    !among(p.riverZoom, ['year', 'month'] as const) ||
    !among(p.calZoom, ['year', 'month'] as const) ||
    !among(p.calOrient, ['v', 'h'] as const) ||
    !among(p.focus, [0, 3, 5, 7, 10] as const) ||
    !among(p.moonAlt, [0, 5, 10, 15] as const) ||
    !among(p.crescent, [0, 0.1, 0.2, 0.3] as const) ||
    typeof p.expanded !== 'boolean' ||
    (p.night !== null && typeof p.night !== 'string')
  )
    throw new Error(INVALID);
  const [year, month] = p.start.split('-').map(Number);
  if (year < 100 || year > 9997) throw new Error(INVALID);
  if (p.night !== null) {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(p.night)) throw new Error(INVALID);
    const [y, m, d] = p.night.split('-').map(Number);
    const day = new Date(Date.UTC(y, m - 1, d));
    const offset = (y - year) * 12 + m - month;
    if (
      day.getUTCFullYear() !== y ||
      day.getUTCMonth() !== m - 1 ||
      day.getUTCDate() !== d ||
      offset < 0 ||
      offset >= 14
    )
      throw new Error(INVALID);
  }
  if (
    p.expanded &&
    (!p.night ||
      (p.view !== 'lunations' &&
        !(p.view === 'river' && p.riverZoom === 'month') &&
        !(p.view === 'calendar' && p.calZoom === 'month')))
  )
    throw new Error(INVALID);
  if (p.site !== undefined && (!isSite(p.site) || p.site.name.length > 200))
    throw new Error(INVALID);
  return {
    v: 1,
    start: p.start,
    view: p.view,
    riverZoom: p.riverZoom,
    calZoom: p.calZoom,
    calOrient: p.calOrient,
    focus: p.focus,
    moonAlt: p.moonAlt,
    crescent: p.crescent,
    night: p.night,
    expanded: p.expanded,
    ...(p.site === undefined ? {} : { site: siteRecord(p.site as Site) }),
  };
}

export function readSharedPlan(hash: string): SharedPlan | null {
  if (!hash.startsWith(PREFIX)) return null;
  if (hash.length > 8192) throw new Error(INVALID);
  try {
    const params = new URLSearchParams(hash.slice(1));
    if (params.get('npa') === '1') {
      for (const key of params.keys())
        if (params.getAll(key).length !== 1) throw new Error(INVALID);
      const number = (key: string, fallback?: number) => {
        const value = params.get(key);
        if (value === null) return fallback;
        if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)) throw new Error(INVALID);
        return Number(value);
      };
      const expanded = params.get('expanded');
      if (expanded !== null && expanded !== '0' && expanded !== '1') throw new Error(INVALID);
      const hasSite = ['name', 'lat', 'lon', 'tz', 'elevation'].some((key) => params.has(key));
      return validate({
        v: 1,
        start: params.get('start'),
        view: params.get('view') ?? DEFAULTS.view,
        riverZoom: params.get('riverZoom') ?? DEFAULTS.riverZoom,
        calZoom: params.get('calZoom') ?? DEFAULTS.calZoom,
        calOrient: params.get('calOrient') ?? DEFAULTS.calOrient,
        focus: number('focus', DEFAULTS.focus),
        moonAlt: number('moonAlt', DEFAULTS.moonAlt),
        crescent: number('crescent', 0)! / 100,
        night: params.get('night'),
        expanded: expanded === '1',
        ...(hasSite
          ? {
              site: {
                name: params.get('name'),
                lat: number('lat'),
                lon: number('lon'),
                tz: params.get('tz'),
                ...(params.has('elevation') ? { elevation: number('elevation') } : {}),
              },
            }
          : {}),
      });
    }
    // Keep previously copied JSON links working; new links use readable fields.
    return validate(JSON.parse(decodeURIComponent(hash.slice(PREFIX.length))));
  } catch {
    throw new Error(INVALID);
  }
}

export function createShareLink(base: string, plan: SharedPlan): string {
  const clean = validate(plan);
  const url = new URL(base);
  url.search = '';
  const params = new URLSearchParams({ npa: '1', view: clean.view, start: clean.start });
  if (clean.night) params.set('night', clean.night);
  for (const key of ['riverZoom', 'calZoom', 'calOrient', 'focus', 'moonAlt'] as const)
    if (clean[key] !== DEFAULTS[key]) params.set(key, String(clean[key]));
  if (clean.crescent !== DEFAULTS.crescent) params.set('crescent', String(clean.crescent * 100));
  if (clean.expanded) params.set('expanded', '1');
  if (clean.site)
    for (const [key, value] of Object.entries(clean.site)) params.set(key, String(value));
  // A slash is safe in a fragment value; keep IANA names like America/Los_Angeles readable.
  url.hash = params.toString().replaceAll('%2F', '/');
  if (url.hash.length > 8192) throw new Error(INVALID);
  return url.href;
}
