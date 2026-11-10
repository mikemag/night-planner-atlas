import { S, data, viewReady } from '../app/state';
import { nightTitle } from '../model/format';
import { cv, size } from '../render/surface';
import { river } from '../views/river';
import { el, scroller } from './dom';

/** Keyboard twin of the painted minimap; pointer input continues to go to the canvas. */
export function initRiverMinimap(): void {
  el('riverMinimap').addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !viewReady()) return;
    const i = river.topNight();
    const last = data.range!.nights.length - 1;
    let y: number;
    switch (event.key) {
      case 'ArrowUp':
        y = river.ys[Math.max(0, i - 1)];
        break;
      case 'ArrowDown':
        y = river.ys[Math.min(last, i + 1)];
        break;
      case 'PageUp':
        y = scroller.scrollTop - (size.H - river.AX);
        break;
      case 'PageDown':
        y = scroller.scrollTop + (size.H - river.AX);
        break;
      case 'Home':
        y = 0;
        break;
      case 'End':
        y = scroller.scrollHeight;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    scroller.scrollTop = y;
  });
}

export function updateRiverMinimap(): void {
  const nav = el('riverMinimap');
  nav.hidden = S.view !== 'river' || S.riverZoom !== 'month' || !river.MINI || !viewReady();
  if (nav.hidden) {
    if (document.activeElement === nav) cv.focus({ preventScroll: true });
    return;
  }
  nav.style.top = `${scroller.scrollTop + river.AX}px`;
  nav.style.width = `${river.MINI}px`;
  nav.style.height = `${Math.max(0, size.H - river.AX)}px`;
  const maximum = scroller.scrollHeight - scroller.clientHeight;
  nav.setAttribute(
    'aria-valuenow',
    String(maximum > 0 ? Math.round((100 * scroller.scrollTop) / maximum) : 0),
  );
  const night = data.range!.nights[river.topNight()];
  if (night)
    nav.setAttribute('aria-valuetext', `${nightTitle(night)} at the top. Selection unchanged.`);
}
