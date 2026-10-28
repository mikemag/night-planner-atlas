import { expect, it } from 'vitest';
import { layoutBoundaryLabels } from './boundary-labels';

it('keeps semantic lanes and exact boundaries while separating crowded labels horizontally', () => {
  const inputs = [20, 26, 31, 38].map((x) => ({ x, width: 60, lane: 2 }));
  const result = layoutBoundaryLabels(inputs, 350);
  expect(result.map((r) => r.x)).toEqual(inputs.map((r) => r.x));
  expect(result.map((r) => r.lane)).toEqual([2, 2, 2, 2]);
  for (const r of result) {
    expect(r.labelX - r.width / 2).toBeGreaterThanOrEqual(8);
    expect(r.labelX + r.width / 2).toBeLessThanOrEqual(342);
  }
  for (let i = 1; i < result.length; i++)
    expect(result[i].labelX - result[i - 1].labelX).toBeGreaterThanOrEqual(66);
});

it('moves colliding labels equally and leaves separated labels at their boundaries', () => {
  expect(
    layoutBoundaryLabels(
      [
        { x: 150, width: 60, lane: 0 },
        { x: 160, width: 60, lane: 0 },
      ],
      350,
    ).map((r) => r.labelX),
  ).toEqual([122, 188]);
  expect(
    layoutBoundaryLabels(
      [
        { x: 50, width: 60, lane: 0 },
        { x: 250, width: 60, lane: 0 },
      ],
      350,
    ).map((r) => r.labelX),
  ).toEqual([50, 250]);
});

it('Moon events cannot move twilight labels into different lanes', () => {
  const sun = [
    { x: 150, width: 65, lane: 0 },
    { x: 160, width: 65, lane: 1 },
  ];
  const base = layoutBoundaryLabels(sun, 350);
  for (const x of [20, 150, 160, 300]) {
    const result = layoutBoundaryLabels([...sun, { x, width: 65, lane: 4 }], 350);
    expect(result.slice(0, 2)).toEqual(base);
  }
});
