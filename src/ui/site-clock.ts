import { S, data } from '../app/state';
import { LiveNights } from '../app/live-nights';
import { siteKey } from '../app/night-cache-format';
import { formatNightStatus, formatSiteClock, nextClockTick } from '../model/site-clock';
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
  el('siteClockCountdown').textContent =
    nights.unavailable && !status?.solar ? 'Phase timing unavailable' : text.phase;
  el('siteClockUsable').textContent =
    nights.unavailable && !status?.usable && (!status || status.usablePending)
      ? 'Usable dark timing unavailable'
      : text.dark;
  el('siteClock').dataset.combined = text.combined;
  el('siteClockCountdown').classList.toggle('usable-now', text.active && text.combined === 'end');
  el('siteClockUsable').classList.toggle('usable-now', text.active && text.combined !== 'end');

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
