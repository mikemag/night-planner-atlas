import { describe, expect, it } from 'vitest';
import { moonlightOpacity, zenithMoonlight, MIN_MOON_OPACITY, MAX_MOON_OPACITY } from './moonlight';

describe('fixed-reference moonlight for display', () => {
  it('reproduces the independent published K&S Table 2 zenith column', () => {
    // Moon 30° high; paper rounds its nanoLambert values to integers.
    for (const [phase, nL] of [
      [30, 530],
      [60, 247],
      [90, 99],
      [120, 29],
    ])
      expect(Math.abs(zenithMoonlight(phase, 30) - nL)).toBeLessThan(1);
  });

  it('keeps the brighter floor/ceiling and the physical full-to-new phase convention', () => {
    expect(moonlightOpacity(0, 60)).toBe(MAX_MOON_OPACITY);
    for (const altitude of [0, 10, 30, 60, 80, 90]) {
      const values = [0, 45, 90, 135, 180].map((phase) => moonlightOpacity(phase, altitude));
      expect(values.every((value) => value >= MIN_MOON_OPACITY && value <= MAX_MOON_OPACITY)).toBe(
        true,
      );
      expect(values.every((value, i) => i === 0 || value <= values[i - 1])).toBe(true);
    }
    expect(moonlightOpacity(90, 30)).toBeGreaterThan(moonlightOpacity(90, 0));
  });

  it('holds a below-horizon center at zero and stays continuous outside the 10° aureole', () => {
    for (const phase of [0, 90, 180]) {
      expect(moonlightOpacity(phase, -1)).toBe(moonlightOpacity(phase, 0));
      expect(moonlightOpacity(phase, 90)).toBe(moonlightOpacity(phase, 80));
      expect(Math.abs(moonlightOpacity(phase, 79.999) - moonlightOpacity(phase, 80))).toBeLessThan(
        0.00001,
      );
    }
  });
});
