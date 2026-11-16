import { solarCrossings, type Interval, type Night, type SunEvent } from './night';
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

/** Read the chart's real solar crossings, never a clipped noon boundary. */
export function nextSolarPhase(nights: readonly Night[], now: number): NextSolarPhase | null {
  let next: NextSolarPhase | null = null;
  for (const n of nights) {
    if (n.nextNoon <= now || (next && n.noon >= next.at)) continue;
    for (const { event, t } of solarCrossings(n))
      if (t > now && (!next || t < next.at)) next = { event, at: t, name: NEXT_PHASE[event] };
  }
  return next;
}

export const COUNTDOWN_SECONDS_WINDOW = 5 * MS_M;

/** Elapsed time, rounded up; seconds in the final five minutes, never zero before a boundary. */
export function formatCountdown(remaining: number): string {
  if (remaining <= COUNTDOWN_SECONDS_WINDOW) {
    const seconds = Math.max(1, Math.ceil(remaining / 1000));
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
  }
  const minutes = Math.ceil(remaining / MS_M);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const duration = [days && `${days}d`, hours && `${hours}h`, mins && `${mins}m`]
    .filter(Boolean)
    .join(' ');
  return duration;
}

export function formatPhaseCountdown(next: NextSolarPhase, now: number): string {
  return `${formatCountdown(next.at - now)} until ${next.name}`;
}

export interface NightStatus {
  solar: NextSolarPhase | null;
  /** A usable start within this night's darkness, or the current window's end. */
  usable: { active: boolean; at: number | null } | null;
  /** More coverage is needed to settle usable darkness, including an unknown current end. */
  usablePending: boolean;
  /** End of uninterrupted coverage, not necessarily a real transition. */
  through: number;
}

/** Promote the nearest known boundary; exact ties retain the combined solar/usable wording. */
export function nextLiveTransition(status: NightStatus | null) {
  const solar = status?.solar;
  const usable = status?.usable;
  if (usable?.at != null && (!solar || usable.at < solar.at))
    return {
      kind: 'usable' as const,
      at: usable.at,
      name: usable.active ? 'usable dark ends' : 'usable dark',
    };
  return solar ? { kind: 'solar' as const, at: solar.at, name: solar.name } : null;
}

/** Use the very same derived windows as the views, joining them across observing-date boundaries. */
export function nightStatus(nights: readonly Night[], now: number): NightStatus | null {
  const first = nights.findIndex((n) => n.noon <= now && now < n.nextNoon);
  if (first < 0) return null;
  let end = first + 1;
  while (end < nights.length && nights[end].noon === nights[end - 1].nextNoon) end++;
  const covered = nights.slice(first, end);
  const through = covered.at(-1)!.nextNoon;
  // Stop at this observing night's astronomical dawn. Only darkness that actually
  // continues through noon can extend the search into subsequent observing dates.
  let darkEnd = covered[0].sunBelow.astronomical.at(-1)?.[1] ?? covered[0].noon;
  for (let i = 1; i < covered.length && darkEnd === covered[i].noon; i++) {
    const continuation = covered[i].sunBelow.astronomical[0];
    if (continuation?.[0] !== darkEnd) break;
    darkEnd = continuation[1];
  }
  let window: Interval | null = null;
  for (const n of covered) {
    if (n.noon >= darkEnd) break;
    for (const [a, b] of n.mf) {
      if (b <= now || a >= darkEnd) continue;
      if (!window) window = [a, b];
      else if (a <= window[1]) window[1] = Math.max(window[1], b);
      else break;
    }
    if (window && window[1] < n.nextNoon) break;
  }
  const active = window != null && window[0] <= now;
  return {
    solar: nextSolarPhase(covered, now),
    usable: window
      ? { active, at: active ? (window[1] < through ? window[1] : null) : window[0] }
      : null,
    usablePending: window ? active && window[1] === through : darkEnd === through,
    through,
  };
}

/** Two text segments become one shared countdown when their actual boundary instants match. */
export function formatNightStatus(status: NightStatus | null, now: number, finished = false) {
  const solar = status?.solar;
  const usable = status?.usable;
  const horizon = Math.max(1, Math.floor(((status?.through ?? now) - now) / MS_D));
  let phase = solar
    ? formatPhaseCountdown(solar, now)
    : finished
      ? `No solar change in next ${horizon}d`
      : 'Finding next phase…';
  let dark = !usable
    ? (status && !status.usablePending) || finished
      ? ''
      : 'Finding usable dark…'
    : usable.active
      ? `Usable dark now${usable.at == null ? '' : `, ends in ${formatCountdown(usable.at - now)}`}`
      : `usable dark in ${formatCountdown(usable.at! - now)}`;
  let combined: 'start' | 'end' | '' = '';
  if (solar && usable?.at === solar.at) {
    if (usable.active) {
      combined = 'end';
      phase = 'Usable dark now';
      dark = `${formatCountdown(solar.at - now)} until ${solar.name}`;
    } else {
      combined = 'start';
      dark = '+ usable dark';
    }
  }
  return { phase, dark, combined, active: usable?.active ?? false };
}

/** Wake at displayed changes and exact boundaries, using event-relative elapsed time. */
export function nextClockTick(status: NightStatus | null, now: number): number {
  let delay = MS_M - (now % MS_M);
  for (const at of [status?.solar?.at, status?.usable?.at]) {
    if (at == null || at <= now) continue;
    const remaining = at - now;
    const step = remaining <= COUNTDOWN_SECONDS_WINDOW ? 1000 : MS_M;
    delay = Math.min(delay, remaining, remaining % step || step);
    if (remaining > COUNTDOWN_SECONDS_WINDOW)
      delay = Math.min(delay, remaining - COUNTDOWN_SECONDS_WINDOW);
  }
  return Math.max(1, delay);
}
