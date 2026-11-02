import { S } from '../app/state';
import { el } from './dom';

/** One key serves the inline toolbar and the full, keyboard-accessible explanation. */
export function initChartLegend(): void {
  const key = el('panelKey');
  const legend = el('legend');
  const trigger = el('legendBtn');
  const popup = el('legendPopover');
  const position = () => {
    const anchor = trigger.getBoundingClientRect();
    const below = innerHeight - anchor.bottom - 14;
    const above = anchor.top - 14;
    const downward = below >= 240 || below >= above;
    popup.style.right = `${Math.max(8, innerWidth - anchor.right)}px`;
    popup.style.top = downward ? `${anchor.bottom + 6}px` : 'auto';
    popup.style.bottom = downward ? 'auto' : `${innerHeight - anchor.top + 6}px`;
    popup.style.maxHeight = `${Math.max(80, downward ? below : above)}px`;
  };
  const close = () => {
    popup.hidePopover();
    trigger.focus({ preventScroll: true });
  };
  popup.addEventListener('beforetoggle', (event) => {
    // Move the existing key so its swatches, wording and visibility never drift apart.
    if (event.newState === 'open') {
      popup.appendChild(legend);
      position();
    } else key.insertBefore(legend, trigger);
  });
  popup.addEventListener('toggle', () => {
    const open = popup.matches(':popover-open');
    trigger.setAttribute('aria-expanded', String(open));
    if (open && !popup.contains(document.activeElement)) {
      popup.scrollTop = 0;
      popup.focus({ preventScroll: true });
    }
  });
  popup.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  });
  el('legendClose').addEventListener('click', close);
  window.addEventListener('resize', () => {
    if (popup.matches(':popover-open')) position();
  });
  window.addEventListener(
    'scroll',
    () => {
      if (!popup.matches(':popover-open')) return;
      const anchor = trigger.getBoundingClientRect();
      if (anchor.bottom < 0 || anchor.top > innerHeight) popup.hidePopover();
      else position();
    },
    { passive: true },
  );
}

export function updateChartLegend(): void {
  // Month/Year calendars label their duration scale directly and do not draw sky bands.
  const hidden = S.view === 'notes' || (S.view === 'calendar' && S.calZoom !== 'week');
  if (hidden && el('legendPopover').matches(':popover-open')) el('legendPopover').hidePopover();
  el('panelKey').hidden = hidden;
  el('acceptedMoonKey').hidden = S.moonAlt <= 0 && S.crescent <= 0;
  el('durationKey').hidden = S.view === 'calendar';
}
