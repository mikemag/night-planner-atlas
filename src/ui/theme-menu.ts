import { setTheme, syncColorScheme, type Theme } from '../app/theme';
import { el } from './dom';
import { closeAppMenu } from './app-menu';

/** A single group of radio items keeps theme selection conventional on every screen. */
export function initThemeMenu(): void {
  const choices = [...el('themeMenu').querySelectorAll<HTMLButtonElement>('[data-theme-choice]')];
  const sync = () => {
    const theme = document.documentElement.dataset.theme ?? 'system';
    for (const choice of choices)
      choice.setAttribute('aria-checked', String(choice.dataset.themeChoice === theme));
  };
  for (const choice of choices)
    choice.addEventListener('click', () => {
      setTheme(choice.dataset.themeChoice as Theme);
      sync();
      closeAppMenu();
    });
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncColorScheme);
  syncColorScheme();
  sync();
}
