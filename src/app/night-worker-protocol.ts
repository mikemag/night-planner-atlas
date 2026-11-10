import type { Night, Site, SolarNight } from '../model/night';

export type NightWork =
  | { date: [number, number, number]; solar?: Omit<SolarNight, 'tz'> }
  | { dates: Array<[number, number, number]> };
/** Only calculation inputs cross the same-origin worker boundary. */
export type NightRequest = NightWork & { id: number; site: Omit<Site, 'name'> };
/** Intl.DateTimeFormat cannot be cloned; the caller supplies its own TimeZone instance. */
export type NightReply =
  | { id: number; night: Omit<Night, 'tz'> }
  | { id: number; solar: Array<Omit<SolarNight, 'tz'>> }
  | { id: number; failed: true };
