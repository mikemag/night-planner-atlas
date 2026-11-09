import { Atmosphere, Body, Observer, SearchAltitude } from 'astronomy-engine';
import { SUN_EVENTS, type Site, type SunEvent } from './night';
import { solarHorizon } from './refraction';
import { MS_D, MS_M } from './time';

/** Current civil time at the site, independent of both the chart date and the viewer's zone. */
export function formatSiteClock(timeZone: string, now: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  const clock = `${part('month')} ${part('day')}, ${part('hour')}:${part('minute')} ${part('dayPeriod')} ${part('timeZoneName')}`;
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')!
    .value.replace('GMT', 'UTC')
    .replace('-', '−');
  return `${clock} (${offset}) · ${timeZone}`;
}

export interface NextSolarPhase {
  event: SunEvent;
  at: number;
  name: string;
}

const NEXT_PHASE: Record<SunEvent, string> = {
  sunset: 'civil twilight',
  civilDusk: 'nautical twilight',
  nauticalDusk: 'astronomical twilight',
  astroDusk: 'astronomical darkness',
  astroDawn: 'astronomical twilight',
  nauticalDawn: 'nautical twilight',
  civilDawn: 'civil twilight',
  sunrise: 'daylight',
};

/** Next real solar transition, independent of the chart range and its noon boundaries. */
export function nextSolarPhase(site: Site, now: number): NextSolarPhase | null {
  const observer = new Observer(site.lat, site.lon, site.elevation ?? 0);
  const horizon = solarHorizon(Atmosphere(observer.height).density);
  const altitudes = [horizon, -6, -12, -18, -18, -12, -6, horizon];
  let next: NextSolarPhase | null = null;
  // Step past the solver's subsecond tolerance so a just-reached crossing cannot repeat.
  const from = now + 1000;
  // A full year covers polar seasons. Narrow later searches to the earliest event found.
  let until = now + 370 * MS_D;
  for (const [i, event] of SUN_EVENTS.entries()) {
    const result = SearchAltitude(
      Body.Sun,
      observer,
      i < 4 ? -1 : 1,
      new Date(from),
      (until - from) / MS_D,
      altitudes[i],
    );
    if (result) {
      const at = result.date.getTime();
      next = { event, at, name: NEXT_PHASE[event] };
      until = at;
    }
  }
  return next;
}

/** Elapsed time, rounded up to minutes; never show zero before the transition. */
export function formatPhaseCountdown(next: NextSolarPhase, now: number): string {
  const remaining = next.at - now;
  if (remaining < MS_M) return `<1min to ${next.name}`;
  const minutes = Math.ceil(remaining / MS_M);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const duration = [days && `${days}d`, hours && `${hours}h`, mins && `${mins}min`]
    .filter(Boolean)
    .join(' ');
  return `${duration} to ${next.name}`;
}
