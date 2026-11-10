import { S, data } from '../app/state';
import { LiveNights } from '../app/live-nights';
import { siteKey } from '../app/night-cache-format';
import {
  formatCountdown,
  formatNightStatus,
  formatSiteClock,
  nextClockTick,
} from '../model/site-clock';
import { el } from './dom';

const nights = new LiveNights(updateSiteClock);
let timer: number | undefined;

export function updateSiteClock(): void {
  const now = Date.now();
  const clock = formatSiteClock(S.site.tz, now);
  const zone = clock.lastIndexOf(' · ');
  el('siteClockTime').textContent = clock.slice(0, zone);
  el('siteClockZone').textContent = clock.slice(zone);
  el('siteClock').title = S.site.tz;

  const status = nights.read(S.site, S, now, data.ready ? data.range : null);
  const text = formatNightStatus(status, now, nights.finished(status, now));
  const phase = nights.unavailable && !status?.solar ? 'Phase timing unavailable' : text.phase;
  const dark =
    nights.unavailable && !status?.usable && (!status || status.usablePending)
      ? 'Usable dark timing unavailable'
      : text.dark;
  el('siteClockCountdown').textContent = phase;
  el('siteClockUsable').textContent = dark;
  el('siteClock').dataset.combined = text.combined;
  el('siteClockCountdown').classList.toggle('usable-now', text.active && text.combined === 'end');
  el('siteClockUsable').classList.toggle('usable-now', text.active && text.combined !== 'end');

  // Keep two visible phone lines; the full clock, offset and status remain accessible.
  const shortDuration = (at: number) => formatCountdown(at - now).replaceAll('min', 'm');
  const usable = status?.usable;
  const compactDark = usable
    ? usable.active
      ? usable.at != null && text.combined !== 'end'
        ? `Usable dark, ${shortDuration(usable.at)} left`
        : 'Usable dark now'
      : `Usable dark in ${shortDuration(usable.at!)}`
    : dark
      ? nights.unavailable
        ? 'Dark unavailable'
        : 'Finding dark…'
      : '';
  el('siteClockCompactTime').textContent = clock.slice(0, clock.indexOf(' ('));
  el('siteClockCompactUsable').textContent = compactDark;
  el('siteClockCompactUsable').classList.toggle('usable-now', text.active);
  el('siteClockCompactPhase').textContent = (
    text.combined === 'end' ? dark.replace('left, until', 'to') : phase
  ).replaceAll('min', 'm');

  // Let the chart supply its nights first. When browsing another year, the same acquisition
  // path supplies just the missing current months, with no separate solar or lunar solver.
  if (data.ready && data.range && siteKey(data.range.site) === siteKey(S.site))
    nights.extend(S.site, status, now);
  window.clearTimeout(timer);
  timer = window.setTimeout(updateSiteClock, nextClockTick(status, now));
}

export function initSiteClock(): void {
  updateSiteClock();
  window.addEventListener('npa-ready', updateSiteClock);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateSiteClock();
  });
}
