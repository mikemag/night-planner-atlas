import { S } from '../app/state';
import { formatSiteClock } from '../model/site-clock';
import { el } from './dom';

export function updateSiteClock(): void {
  el('siteClock').textContent = formatSiteClock(S.site.tz, Date.now());
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
