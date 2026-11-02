import { S } from '../app/state';
import { formatSiteClock } from '../model/site-clock';
import { el } from './dom';

export function updateSiteClock(): void {
  const clock = formatSiteClock(S.site.tz, Date.now());
  const zone = clock.lastIndexOf(' · ');
  el('siteClockTime').textContent = clock.slice(0, zone);
  el('siteClockZone').textContent = clock.slice(zone);
  el('siteClock').title = S.site.tz;
}

export function initSiteClock(): void {
  updateSiteClock();
  const tick = () => {
    updateSiteClock();
    window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
  };
  window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateSiteClock();
  });
}
