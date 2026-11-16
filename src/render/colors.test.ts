import { expect, test, vi } from 'vitest';
vi.mock('../ui/dom', () => ({ el: vi.fn() }));
import { inkOn } from './colors';

const luminance = (hex: string) => {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((s) => parseInt(s, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};

test('sky labels maintain 4.5:1 through midtones as well as bright and dark colors', () => {
  for (let r = 0; r <= 255; r += 15)
    for (let g = 0; g <= 255; g += 15)
      for (let b = 0; b <= 255; b += 15) {
        const background = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
        const a = luminance(background),
          c = luminance(inkOn(background));
        expect(
          (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05),
          background,
        ).toBeGreaterThanOrEqual(4.5);
      }
});
