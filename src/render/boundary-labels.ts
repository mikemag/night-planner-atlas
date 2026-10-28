export interface BoundaryLabel {
  x: number;
  width: number;
  /** A semantic lane fixed across nights, independent of neighboring events. */
  lane: number;
}

/** Keep semantic lanes fixed; resolve crowding with the smallest horizontal movements. */
export function layoutBoundaryLabels(
  labels: BoundaryLabel[],
  width: number,
  leftBounds: Readonly<Record<number, number>> = {},
) {
  const result = labels.map((label, index) => ({ ...label, index, labelX: label.x }));
  for (const lane of new Set(labels.map((label) => label.lane))) {
    const row = result.filter((label) => label.lane === lane).sort((a, b) => a.x - b.x);
    const offsets: number[] = [];
    let occupied = 0;
    const blocks: Array<{ start: number; end: number; sum: number; count: number }> = [];
    row.forEach((label, i) => {
      offsets.push(occupied);
      blocks.push({ start: i, end: i, sum: label.x - label.width / 2 - occupied, count: 1 });
      occupied += label.width + 6;
      // Pool adjacent violations of the ordering constraint, rather than pushing labels one way.
      while (blocks.length > 1) {
        const b = blocks.at(-1)!;
        const a = blocks.at(-2)!;
        if (a.sum / a.count <= b.sum / b.count) break;
        blocks.splice(-2, 2, {
          start: a.start,
          end: b.end,
          sum: a.sum + b.sum,
          count: a.count + b.count,
        });
      }
    });
    const left = leftBounds[lane] ?? 8;
    const right = Math.max(left, width - 8 - (occupied - 6));
    for (const block of blocks) {
      const origin = Math.max(left, Math.min(right, block.sum / block.count));
      for (let i = block.start; i <= block.end; i++)
        row[i].labelX = offsets[i] + origin + row[i].width / 2;
    }
  }
  return result;
}
