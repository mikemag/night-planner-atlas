import { el } from '../ui/dom';

/** Canvas colors, read from the theme tokens in atlas.css. */
export interface Palette {
  day: string;
  civil: string;
  naut: string;
  astro: string;
  dark: string;
  /** "r, g, b" for use inside rgba(). */
  moon: string;
  /** Green moonlight accepted by planning thresholds; "r, g, b" for rgba(). */
  acceptedMoon: string;
  good: string;
  ink: string;
  ink2: string;
  ink3: string;
  hair: string;
  hair2: string;
  panel: string;
  raised: string;
  chip: string;
  select: string;
  now: string;
  weekend: string;
  accent: string;
}

export const C: Palette = {
  day: '',
  civil: '',
  naut: '',
  astro: '',
  dark: '',
  moon: '',
  acceptedMoon: '',
  good: '',
  ink: '',
  ink2: '',
  ink3: '',
  hair: '',
  hair2: '',
  panel: '',
  raised: '',
  chip: '',
  select: '',
  now: '',
  weekend: '',
  accent: '',
};

/** Re-read the tokens (at boot and whenever the theme changes). */
export function readColors(): void {
  const cs = getComputedStyle(document.documentElement);
  const g = (k: string) => cs.getPropertyValue(k).trim();
  Object.assign(C, {
    day: g('--sky-day'),
    civil: g('--sky-civil'),
    naut: g('--sky-naut'),
    astro: g('--sky-astro'),
    dark: g('--sky-dark'),
    moon: g('--moon-rgb'),
    acceptedMoon: g('--moon-accepted-rgb'),
    good: g('--good'),
    ink: g('--ink'),
    ink2: g('--ink-2'),
    ink3: g('--ink-3'),
    hair: g('--hair'),
    hair2: g('--hair-2'),
    panel: g('--panel'),
    raised: g('--raised'),
    chip: g('--chip'),
    select: g('--select'),
    now: g('--now'),
    weekend: g('--weekend'),
    accent: g('--accent'),
  } satisfies Palette);
  for (const [id, rgb] of [
    ['moonSw', C.moon],
    ['acceptedMoonSw', C.acceptedMoon],
  ]) {
    el(id).style.background =
      `linear-gradient(90deg, rgba(${rgb},${moonAlpha(0)}), rgba(${rgb},${moonAlpha(1)})), ${C.dark}`;
  }
}

/** Ink or white, whichever reads better on the hex color `hex`. */
export function inkOn(hex: string): string {
  const c = hex.replace('#', '');
  if (c.length < 6) return C.ink;
  const r = parseInt(c.slice(0, 2), 16),
    g = parseInt(c.slice(2, 4), 16),
    b = parseInt(c.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? '#111726' : '#ffffff';
}

/** Opacity of the moonlight wash over true dark: a full moon reads like late nautical twilight. */
export function moonAlpha(illum: number): number {
  return 0.17 + 0.4 * Math.pow(illum, 0.8);
}
