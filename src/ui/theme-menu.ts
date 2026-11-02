import { setTheme, type Theme } from '../app/theme';
import { el } from './dom';

const labels: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  observing: 'Observing',
};

/** Return a position updater for the parent popover's resize and scroll handling. */
export function initThemeMenu(): () => void {
  const parent = el('appMenu');
  const trigger = el('themeBtn');
  const menu = el('themeMenu');
  const choices = [...menu.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')];
  const phone = matchMedia('(max-width: 700px)');
  let inline = false;
  const open = () => (inline ? !menu.hidden : menu.matches(':popover-open'));
  const selected = () => choices.find((choice) => choice.getAttribute('aria-checked') === 'true')!;
  const sync = () => {
    // Read the requested theme, so System stays selected regardless of the device palette.
    const theme = (document.documentElement.dataset.theme ?? 'system') as Theme;
    el('themeMenuLabel').textContent = `Theme · ${labels[theme]}`;
    for (const choice of choices)
      choice.setAttribute('aria-checked', String(choice.dataset.themeChoice === theme));
  };
  const position = () => {
    if (inline) return;
    const root = parent.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    const top = Math.max(8, anchor.top - 8);
    const width = parseFloat(getComputedStyle(menu).width);
    const right = root.right + 4 + width <= innerWidth - 8;
    menu.style.left = `${right ? root.right + 4 : Math.max(8, root.left - width - 4)}px`;
    menu.style.top = `${top}px`;
    menu.style.maxHeight = `${Math.max(80, innerHeight - top - 8)}px`;
    trigger.dataset.side = right ? 'right' : 'left';
  };
  const close = (restoreFocus = false) => {
    if (inline) menu.hidden = true;
    else if (open()) menu.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };
  const show = () => {
    if (inline) menu.hidden = false;
    else menu.showPopover();
    trigger.setAttribute('aria-expanded', 'true');
    selected().focus();
  };
  const configure = () => {
    const focused = menu.contains(document.activeElement);
    close();
    menu.style.left = '';
    menu.style.top = '';
    menu.style.maxHeight = '';
    inline = phone.matches;
    if (inline) {
      menu.removeAttribute('popover');
      menu.hidden = true;
    } else {
      menu.hidden = false;
      menu.popover = 'auto';
    }
    if (focused && parent.matches(':popover-open')) trigger.focus();
  };
  trigger.addEventListener('click', () => (open() ? close(true) : show()));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      show();
    } else if (open() && (event.key === 'ArrowLeft' || event.key === 'Escape')) {
      event.preventDefault();
      close(true);
    }
  });
  menu.addEventListener('beforetoggle', (event) => {
    if (event.newState === 'open') position();
  });
  menu.addEventListener('toggle', () => trigger.setAttribute('aria-expanded', String(open())));
  menu.addEventListener('keydown', (event) => {
    const index = choices.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = (index + 1) % choices.length;
    else if (event.key === 'ArrowUp') next = (index + choices.length - 1) % choices.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = choices.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      choices[next].focus();
    } else if (event.key === 'Escape' || event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      close();
      (event.shiftKey ? trigger : el('guideBtn')).focus();
    }
  });
  for (const choice of choices)
    choice.addEventListener('click', () => {
      setTheme(choice.dataset.themeChoice as Theme);
      sync();
    });
  parent.addEventListener('beforetoggle', (event) => {
    if (event.newState === 'closed') close();
  });
  phone.addEventListener('change', configure);
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  configure();
  sync();
  return () => {
    if (open()) position();
  };
}
