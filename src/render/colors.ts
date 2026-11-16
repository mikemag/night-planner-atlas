import { el } from '../ui/dom';
import { MIN_MOON_OPACITY, MAX_MOON_OPACITY } from '../model/moonlight';

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
  /** An extra dashed boundary cue in the observing palette; transparent in ordinary themes. */
  acceptedEdge: string;
  good: string;
  ink: string;
  ink2: string;
  ink3: string;
  hair: string;
  hair2: string;
  riverRowSeparator: string;
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
  acceptedEdge: '',
  good: '',
  ink: '',
  ink2: '',
  ink3: '',
  hair: '',
  hair2: '',
  riverRowSeparator: '',
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
    acceptedEdge: g('--moon-accepted-edge'),
    good: g('--good'),
    ink: g('--ink'),
    ink2: g('--ink-2'),
    ink3: g('--ink-3'),
    hair: g('--hair'),
    hair2: g('--hair-2'),
    riverRowSeparator: g('--river-row-separator'),
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
      `linear-gradient(90deg, rgba(${rgb},${MIN_MOON_OPACITY}), rgba(${rgb},${MAX_MOON_OPACITY})), ${C.dark}`;
  }
}

/** Ink or white, whichever reads better on the hex color `hex`. */
export function inkOn(hex: string): string {
  const c = hex.replace('#', '');
  if (c.length < 6) return C.ink;
  const r = parseInt(c.slice(0, 2), 16),
    g = parseInt(c.slice(2, 4), 16),
    b = parseInt(c.slice(4, 6), 16);
  const linear = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (r: number, g: number, b: number) =>
    0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  const light = luminance(r, g, b);
  const darkContrast = (light + 0.05) / (luminance(17, 23, 38) + 0.05);
  const whiteContrast = 1.05 / (light + 0.05);
  if (Math.max(darkContrast, whiteContrast) < 4.5) return '#000000';
  return darkContrast > whiteContrast ? '#111726' : '#ffffff';
}
