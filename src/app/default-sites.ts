import type { Site } from '../model/night';

/** Public starter sites; elevation sources are recorded in docs/design.md. */
export const DEFAULT_SITES: readonly (Site & { id: string })[] = [
  {
    id: 'seattle-paramount-park',
    name: 'Seattle, Paramount Park',
    lat: 47.74028262343255,
    lon: -122.31984159452988,
    tz: 'America/Los_Angeles',
    elevation: 122,
  },
  {
    id: 'edinburgh-royal-observatory',
    name: 'Edinburgh, Royal Observatory',
    lat: 55.922951075633726,
    lon: -3.1872791924809594,
    tz: 'Europe/London',
    elevation: 134,
  },
  {
    id: 'sydney-linden-observatory',
    name: 'Sydney, Linden Observatory',
    lat: -33.70760233632339,
    lon: 150.49544929067713,
    tz: 'Australia/Sydney',
    elevation: 574,
  },
  {
    id: 'chile-rubin-observatory',
    name: 'Chile, Vera C. Rubin Observatory',
    lat: -30.24459999329398,
    lon: -70.74933910621036,
    tz: 'America/Santiago',
    elevation: 2647,
  },
  {
    id: 'quito-astronomical-observatory',
    name: 'Quito, Astronomical Observatory',
    lat: -0.215,
    lon: -78.5025,
    tz: 'America/Guayaquil',
    elevation: 2823,
  },
  {
    id: 'svalbard-kjell-henriksen-observatory',
    name: 'Svalbard, Kjell Henriksen Observatory',
    lat: 78.148,
    lon: 16.043,
    tz: 'Arctic/Longyearbyen',
    elevation: 520,
  },
];
