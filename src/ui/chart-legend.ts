import Dropdown from 'bootstrap/js/dist/dropdown';
import { S } from '../app/state';
import { el } from './dom';
import { dropdownOptions } from './dropdown';

/** One key serves the toolbar and full explanation; Bootstrap positions and dismisses it. */
export function initChartLegend(): void {
  const key = el('panelKey');
  const legend = el('legend');
  const trigger = el('legendBtn');
  const popup = el('legendPopover');
  const dropdown = new Dropdown(trigger, {
    ...dropdownOptions,
    autoClose: 'outside',
  });
  trigger.addEventListener('show.bs.dropdown', () => popup.appendChild(legend));
  trigger.addEventListener('shown.bs.dropdown', () => {
    popup.scrollTop = 0;
    popup.focus({ preventScroll: true });
  });
  trigger.addEventListener('hidden.bs.dropdown', () => {
    if (popup.contains(document.activeElement)) trigger.focus({ preventScroll: true });
    key.insertBefore(legend, trigger);
  });
  el('legendClose').addEventListener('click', () => {
    dropdown.hide();
    trigger.focus({ preventScroll: true });
  });
}

export function updateChartLegend(): void {
  const hidden = S.view === 'notes' || (S.view === 'calendar' && S.calZoom !== 'week');
  if (hidden) Dropdown.getInstance(el('legendBtn'))?.hide();
  el('panelKey').hidden = hidden;
  el('acceptedMoonKey').hidden = S.moonAlt <= 0 && S.crescent <= 0;
  el('durationKey').hidden = S.view === 'calendar';
}
