import type { Site } from './night';

export interface Coordinates {
  lat: number;
  lon: number;
}

export function checkCoordinates(lat: number, lon: number): Coordinates {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90)
    throw new Error('Latitude must be between −90° and 90°.');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180)
    throw new Error('Longitude must be between −180° and 180°.');
  return { lat, lon };
}

const DECIMAL = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const PAIR = new RegExp(`^\\s*(${DECIMAL})(?:\\s*,\\s*|\\s+)(${DECIMAL})\\s*$`);
const COPY_POINT =
  'Open the link in Google Maps, copy the intended point’s latitude and longitude, and paste them here. The help below this field shows how.';

function pair(text: string): Coordinates | null {
  const match = PAIR.exec(text.replaceAll('−', '-'));
  return match ? checkCoordinates(Number(match[1]), Number(match[2])) : null;
}

/** Parse input text only. URLs are never fetched and no camera position is treated as a pin. */
export function parseSiteInput(input: string): Coordinates {
  const text = input.trim();
  const direct = pair(text);
  if (direct) return direct;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(
      'Paste decimal latitude, longitude, for example 47.60621, -122.34253, or a full coordinate-bearing Google Maps search link.',
    );
  }
  if (url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl')
    throw new Error(`Short Maps links cannot be read offline. ${COPY_POINT}`);
  if (
    !/^https?:$/.test(url.protocol) ||
    !/^(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(url.hostname)
  )
    throw new Error('Use a full Google Maps search link or paste the point’s latitude, longitude.');
  if (
    /\/dir(?:\/|$)/.test(url.pathname) ||
    ['query_place_id', 'place_id', 'cid'].some((key) => url.searchParams.has(key))
  )
    throw new Error(
      `This link identifies directions or a place rather than one clear point. ${COPY_POINT}`,
    );
  const allowedPath =
    /^\/maps(?:\/search)?\/?$/.test(url.pathname) ||
    (url.hostname === 'maps.google.com' && url.pathname === '/');
  const values = ['query', 'q'].flatMap((key) => url.searchParams.getAll(key));
  const points = allowedPath ? values.map((value) => pair(value.replace(/^loc:/i, ''))) : [];
  if (!points.length || points.some((point) => point == null))
    throw new Error(
      `This link does not identify a supported point. A map’s center may differ from your intended location. ${COPY_POINT}`,
    );
  const point = points[0]!;
  if (points.some((other) => other!.lat !== point.lat || other!.lon !== point.lon))
    throw new Error(
      'This link contains conflicting coordinate pairs. Paste the intended point’s latitude, longitude.',
    );
  return point;
}

export function isSite(value: unknown): value is Site {
  if (!value || typeof value !== 'object') return false;
  const site = value as Site;
  if (
    typeof site.name !== 'string' ||
    typeof site.tz !== 'string' ||
    !site.tz ||
    /^[+-]/.test(site.tz)
  )
    return false;
  try {
    checkCoordinates(site.lat, site.lon);
    new Intl.DateTimeFormat('en-US', { timeZone: site.tz });
  } catch {
    return false;
  }
  return (
    site.elevation == null ||
    (typeof site.elevation === 'number' &&
      Number.isFinite(site.elevation) &&
      site.elevation >= -500 &&
      site.elevation <= 10000)
  );
}
