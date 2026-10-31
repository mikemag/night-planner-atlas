import { describe, expect, it } from 'vitest';
import type { Interval } from '../model/night';
import { moonlightBands } from './moonlight';

const bands = (td: Interval | null, mf: Interval[], above: Interval[]) =>
  moonlightBands({
    sunBelow: { sun: [], civil: [], nautical: [], astronomical: td ? [td] : [] },
    mf,
    moonWindows: { 0: { above, crossings: [] } },
  });

describe('physical moonlight and accepted moonlit time', () => {
  it('clips a continuous Moon to both dark intervals of a polar observing period', () => {
    expect(
      moonlightBands({
        sunBelow: {
          sun: [],
          civil: [],
          nautical: [],
          astronomical: [
            [0, 20],
            [80, 100],
          ],
        },
        mf: [],
        moonWindows: { 0: { above: [[0, 100]], crossings: [] } },
      }),
    ).toEqual({
      ordinary: [
        [0, 20],
        [80, 100],
      ],
      accepted: [],
    });
  });
  it('leaves strict moon-free windows plain black, clipping the wash to true dark', () => {
    expect(
      bands(
        [10, 90],
        [[30, 70]],
        [
          [0, 30],
          [70, 100],
        ],
      ),
    ).toEqual({
      ordinary: [
        [10, 30],
        [70, 90],
      ],
      accepted: [],
    });
  });
  it('colors only the low-moon extensions admitted at an elevated threshold', () => {
    expect(
      bands(
        [10, 90],
        [[20, 80]],
        [
          [0, 30],
          [70, 100],
        ],
      ),
    ).toEqual({
      ordinary: [
        [10, 20],
        [80, 90],
      ],
      accepted: [
        [20, 30],
        [70, 80],
      ],
    });
  });
  it('ignoring a crescent colors all of its moonlit true dark', () => {
    expect(
      bands(
        [10, 90],
        [[10, 90]],
        [
          [0, 30],
          [70, 100],
        ],
      ),
    ).toEqual({
      ordinary: [],
      accepted: [
        [10, 30],
        [70, 90],
      ],
    });
  });
  it('draws no moonlight bands without true dark or while the Moon is down', () => {
    expect(bands(null, [], [[0, 100]])).toEqual({ ordinary: [], accepted: [] });
    expect(bands([10, 90], [[10, 90]], [])).toEqual({ ordinary: [], accepted: [] });
  });
});
