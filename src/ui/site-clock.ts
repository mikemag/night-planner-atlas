import { S } from '../app/state';
import type { Site } from '../model/night';
import {
  formatPhaseCountdown,
  formatSiteClock,
  nextSolarPhase,
  type NextSolarPhase,
} from '../model/site-clock';
import { MS_D, MS_M } from '../model/time';
import { el } from './dom';

let phase: { site: Site; from: number; next: NextSolarPhase | null } | null = null;
let timer: number | undefined;

export function updateSiteClock(): void {
  const now = Date.now();
  const clock = formatSiteClock(S.site.tz, now);
  const zone = clock.lastIndexOf(' · ');
  el('siteClockTime').textContent = clock.slice(0, zone);
  el('siteClockZone').textContent = clock.slice(zone);
  el('siteClock').title = S.site.tz;

  if (
    !phase ||
    phase.site.lat !== S.site.lat ||
    phase.site.lon !== S.site.lon ||
    (phase.site.elevation ?? 0) !== (S.site.elevation ?? 0) ||
    now < phase.from ||
    now >= (phase.next?.at ?? phase.from + MS_D)
  ) {
    phase = { site: { ...S.site }, from: now, next: nextSolarPhase(S.site, now) };
  }
  const next = phase.next;
  el('siteClockCountdown').textContent = next
    ? formatPhaseCountdown(next, now)
    : 'Next phase unavailable';

  // Tick at clock minutes, countdown minutes and the transition itself. Re-arm on site
  // changes and tab restoration, always using real elapsed time rather than counting ticks.
  let delay = MS_M - (now % MS_M);
  if (next) {
    const remaining = next.at - now;
    delay = Math.min(delay, remaining, (remaining % MS_M || MS_M) + 1);
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(updateSiteClock, Math.max(1, delay));
}

export function initSiteClock(): void {
  updateSiteClock();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateSiteClock();
  });
}
