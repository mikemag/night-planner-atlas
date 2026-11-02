import { el } from './dom';
import { initThemeMenu } from './theme-menu';

export function closeAppMenu(): void {
  const menu = el('appMenu');
  if (menu.matches(':popover-open')) menu.hidePopover();
}

/** A native, nonmodal popover supplies light dismissal and Escape behavior. */
export function initAppMenu(): void {
  const positionThemeMenu = initThemeMenu();
  const menu = el('appMenu');
  const trigger = el('moreBtn');
  const position = () => {
    const anchor = trigger.getBoundingClientRect();
    menu.style.top = `${anchor.bottom + 6}px`;
    menu.style.right = `${Math.max(8, innerWidth - anchor.right)}px`;
    menu.style.maxHeight = `${Math.max(80, innerHeight - anchor.bottom - 14)}px`;
    positionThemeMenu();
  };
  menu.addEventListener('beforetoggle', (event) => {
    if (event.newState === 'open') position();
  });
  menu.addEventListener('toggle', () => {
    const open = menu.matches(':popover-open');
    trigger.setAttribute('aria-expanded', String(open));
    if (open && !menu.contains(document.activeElement))
      menu.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    closeAppMenu();
    trigger.focus({ preventScroll: true });
  });
  window.addEventListener('resize', () => {
    if (menu.matches(':popover-open')) position();
  });
  window.addEventListener(
    'scroll',
    () => {
      if (!menu.matches(':popover-open')) return;
      const anchor = trigger.getBoundingClientRect();
      if (anchor.bottom < 0 || anchor.top > innerHeight) closeAppMenu();
      else position();
    },
    { passive: true },
  );
}
