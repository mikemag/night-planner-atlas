import { store } from './settings';

export type Theme = 'system' | 'light' | 'dark' | 'observing';

export function loadTheme(): Theme {
  const value = store.get<string>('theme', 'system');
  return value === 'light' || value === 'dark' || value === 'observing' ? value : 'system';
}

/** CSS handles System; explicit preferences apply to native controls and chart tokens alike. */
export function setTheme(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  store.set('theme', theme);
}
