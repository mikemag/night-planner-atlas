import { personal, savePreferences } from './personal-data';

export type Theme = 'system' | 'light' | 'dark' | 'observing';

export function loadTheme(): Theme {
  return personal.snapshot().preferences.theme ?? 'system';
}

/** CSS handles System; explicit preferences apply to native controls and chart tokens alike. */
export function applyTheme(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  void savePreferences({ theme });
}
