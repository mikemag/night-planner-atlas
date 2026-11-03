import Dropdown from 'bootstrap/js/dist/dropdown';
import { el } from './dom';
import { initThemeMenu } from './theme-menu';
import { dropdownOptions } from './dropdown';

export function closeAppMenu(): void {
  Dropdown.getInstance(el('moreBtn'))?.hide();
  el('moreBtn').focus({ preventScroll: true });
}

/** Bootstrap owns positioning, keyboard navigation, light dismissal and Escape. */
export function initAppMenu(): void {
  initThemeMenu();
  const trigger = el('moreBtn');
  const menu = el('appMenu');
  new Dropdown(trigger, dropdownOptions);
  trigger.addEventListener('shown.bs.dropdown', () => {
    [...menu.querySelectorAll<HTMLElement>('.dropdown-item:not(:disabled)')]
      .find((item) => item.getClientRects().length)
      ?.focus({ preventScroll: true });
  });
  trigger.addEventListener('hidden.bs.dropdown', () => {
    if (menu.contains(document.activeElement)) trigger.focus({ preventScroll: true });
  });
}
