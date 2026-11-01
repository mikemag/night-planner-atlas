import {
  SUN_EVENTS,
  wallH,
  type Interval,
  type Night,
  type Site,
  type SunBand,
} from '../model/night';
import { MOON_THRESHOLDS } from '../model/moon';
import { MS_H, TimeZone } from '../model/time';
import { nightDates, type RangeSpec } from '../model/range';
import { pad2 } from '../model/format';

export const CACHE_FORMAT = 1;
declare const __NPA_COMPUTE_REVISION__: string;
/** Vite fingerprints model/codec sources and the resolved astronomy dependency. */
export const COMPUTE_REVISION = __NPA_COMPUTE_REVISION__;
export const CACHE_GENERATION = `${CACHE_FORMAT}:${COMPUTE_REVISION}`;
export type NightData = Pick<
  Night,
  | 'noon'
  | 'nextNoon'
  | 'mid'
  | 'S0'
  | 'ev'
  | 'sunBelow'
  | 'moonAlt'
  | 'moonWindows'
  | 'sunAlt'
  | 'illum'
  | 'phase'
>;
export interface CachedMonth {
  key: string;
  bytes: number;
  nights: NightData[];
}

/** Exact computational inputs; names, favorite IDs and display/planning choices are irrelevant. */
export function siteKey(site: Site): string {
  return JSON.stringify([site.lat, site.lon, site.elevation ?? 0, site.tz]);
}
export function monthKey(site: Site, y: number, m: number, generation = CACHE_GENERATION): string {
  return JSON.stringify([generation, siteKey(site), `${y}-${pad2(m)}`]);
}
export function rangeMonths(spec: RangeSpec): Array<{ y: number; m: number }> {
  return Array.from({ length: spec.count }, (_, i) => {
    const date = new Date(Date.UTC(spec.y, spec.m - 1 + i, 1));
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1 };
  });
}
export function packMonth(key: string, nights: Night[]): CachedMonth {
  const data = nights.map(
    ({ noon, nextNoon, mid, S0, ev, sunBelow, moonAlt, moonWindows, sunAlt, illum, phase }) => ({
      noon,
      nextNoon,
      mid,
      S0,
      ev,
      sunBelow,
      moonAlt,
      moonWindows,
      sunAlt,
      illum,
      phase,
    }),
  );
  // Logical, uncompressed payload estimate: metadata JSON plus native binary sample buffers.
  const bytes =
    new TextEncoder().encode(
      JSON.stringify(data, (_key, value) => (ArrayBuffer.isView(value) ? null : value)),
    ).byteLength + data.reduce((sum, n) => sum + n.moonAlt.byteLength + n.sunAlt.byteLength, 0);
  return { key, bytes, nights: data };
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function intervals(value: unknown, start: number, end: number): value is Interval[] {
  return (
    Array.isArray(value) &&
    value.every(
      (iv, i) =>
        Array.isArray(iv) &&
        iv.length === 2 &&
        finite(iv[0]) &&
        finite(iv[1]) &&
        iv[0] >= start &&
        iv[1] <= end &&
        iv[1] > iv[0] &&
        (i === 0 || iv[0] >= value[i - 1][1]),
    )
  );
}
function isNightData(value: unknown): value is NightData {
  if (
    !object(value) ||
    !['noon', 'nextNoon', 'mid', 'S0', 'illum', 'phase'].every((k) => finite(value[k])) ||
    !(value.moonAlt instanceof Float32Array) ||
    !(value.sunAlt instanceof Float32Array) ||
    value.moonAlt.length < 2 ||
    value.moonAlt.length !== value.sunAlt.length ||
    !value.moonAlt.every(Number.isFinite) ||
    !value.sunAlt.every(Number.isFinite) ||
    !object(value.ev) ||
    !object(value.sunBelow) ||
    !object(value.moonWindows)
  )
    return false;
  const n = value as unknown as NightData;
  if (n.nextNoon <= n.noon || n.illum < 0 || n.illum > 1 || n.phase < 0 || n.phase > 360)
    return false;
  if (
    !SUN_EVENTS.every(
      (k) => n.ev[k] === null || (finite(n.ev[k]) && n.ev[k] >= n.noon && n.ev[k] < n.nextNoon),
    )
  )
    return false;
  if (
    !(['sun', 'civil', 'nautical', 'astronomical'] as SunBand[]).every((k) =>
      intervals(n.sunBelow[k], n.noon, n.nextNoon),
    )
  )
    return false;
  const end = n.S0 + (n.moonAlt.length - 1) * 10 * 60e3;
  return MOON_THRESHOLDS.every((k) => {
    const w = n.moonWindows[k];
    return (
      object(w) &&
      intervals(w.above, n.S0, end) &&
      Array.isArray(w.crossings) &&
      w.crossings.every(
        (c, i) =>
          object(c) &&
          finite(c.t) &&
          c.t >= n.S0 &&
          c.t <= end &&
          typeof c.rising === 'boolean' &&
          (i === 0 || c.t >= w.crossings[i - 1].t),
      )
    );
  });
}

/** Recreate runtime classes/clock fields and reject stale browser time-zone boundaries. */
export function unpackMonth(
  value: unknown,
  key: string,
  y: number,
  m: number,
  tz: TimeZone,
): Night[] | null {
  const dates = nightDates({ y, m, count: 1 });
  if (
    !object(value) ||
    value.key !== key ||
    !Array.isArray(value.nights) ||
    value.nights.length !== dates.length
  )
    return null;
  const out: Night[] = [];
  for (let i = 0; i < dates.length; i++) {
    const raw: unknown = value.nights[i];
    if (!isNightData(raw)) return null;
    const [y, m, d] = dates[i],
      wallNoon = Date.UTC(y, m - 1, d, 12);
    if (
      raw.noon !== tz.utcForWall(wallNoon) ||
      raw.nextNoon !== tz.utcForWall(Date.UTC(y, m - 1, d + 1, 12)) ||
      raw.mid !== tz.utcForWall(Date.UTC(y, m - 1, d + 1))
    )
      return null;
    const n: Night = {
      ...raw,
      id: `${y}-${pad2(m)}-${pad2(d)}`,
      y,
      m,
      d,
      dow: new Date(wallNoon).getUTCDay(),
      wallNoon,
      tz,
      evH: { ...raw.ev },
      dst: tz.offsetMin(raw.noon) !== tz.offsetMin(raw.noon + 20 * MS_H),
      quarter: -1,
      nmOff: 99,
      moonUp: [],
      moonUpH: [],
      td: null,
      tdH: null,
      tdMs: 0,
      moonIgnored: false,
      mf: [],
      mfH: [],
      mfMs: 0,
      moonRise: null,
      moonSet: null,
    };
    for (const k of SUN_EVENTS) n.evH[k] = n.ev[k] === null ? null : wallH(n.ev[k], n);
    out.push(n);
  }
  return out;
}
