import { describe, expect, it } from 'vitest';
import { altitudeArcs, windowAbove } from './moon';
import { MS_M } from './time';

describe('refined lunar crossing search', () => {
  for (const peak of [4 * MS_M, 20 * MS_M - 2000]) {
    for (const sign of [1, -1]) {
      it(`finds a two-second ${sign > 0 ? 'rise/set' : 'set/rise'} pair near ${peak / MS_M} min`, () => {
        const altitude = (ms: number) => sign * (1 - ((ms - peak) / 1000) ** 2);
        const nodes = altitudeArcs(altitude, 0, 20 * MS_M);
        const result = windowAbove(altitude, nodes, 0);
        expect(result.crossings).toHaveLength(2);
        expect(result.crossings.map((c) => c.rising)).toEqual(
          sign > 0 ? [true, false] : [false, true],
        );
        expect(Math.abs(result.crossings[0].t - (peak - 1000))).toBeLessThan(50);
        expect(Math.abs(result.crossings[1].t - (peak + 1000))).toBeLessThan(50);
        expect(result.above).toHaveLength(sign > 0 ? 1 : 2);
      });
    }
  }
  it('clips an already-up Moon at the window edges without inventing rise/set events', () => {
    const altitude = () => 1;
    const result = windowAbove(altitude, altitudeArcs(altitude, 0, 20 * MS_M), 0);
    expect(result.above).toEqual([[0, 20 * MS_M]]);
    expect(result.crossings).toEqual([]);
    expect(windowAbove(() => -1, [0, 20 * MS_M], 0).above).toEqual([]);
  });
  it('does not turn a tangent touch into an above-horizon interval', () => {
    const altitude = (ms: number) => -(((ms - 4 * MS_M) / MS_M) ** 2);
    const result = windowAbove(altitude, altitudeArcs(altitude, 0, 20 * MS_M), 0);
    expect(result.above).toEqual([]);
    expect(result.crossings).toEqual([]);
  });
});
