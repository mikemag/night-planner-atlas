import { STEP, wallH, type Interval, type Night } from '../model/night';

/** Interpolate cached display samples in elapsed time; never used by planning rules. */
export function moonlightAt(n: Pick<Night, 'S0' | 'moonlight'>, t: number): number {
  const position = Math.max(0, Math.min(n.moonlight.length - 1, (t - n.S0) / STEP));
  const i = Math.floor(position),
    next = Math.min(i + 1, n.moonlight.length - 1);
  return n.moonlight[i] + (n.moonlight[next] - n.moonlight[i]) * (position - i);
}

/** Shared Canvas/SVG gradient on the existing wall-clock axis, with exact band endpoints. */
export function moonlightStops(
  n: Night,
  [a, b]: Interval,
): Array<{ offset: number; opacity: number }> {
  const start = wallH(a, n),
    span = wallH(b, n) - start;
  if (span <= 0) return [];
  const stops = new Map<number, number>();
  for (let i = Math.max(0, Math.ceil((a - n.S0) / STEP)); i < n.moonlight.length; i++) {
    const t = n.S0 + i * STEP;
    if (t >= b) break;
    const offset = (wallH(t, n) - start) / span;
    // Repeated clock hours share a position; retain the later passage, as the
    // altitude curve does. Sorting prevents backwards/out-of-range gradient stops.
    if (offset > 0 && offset < 1) stops.set(offset, n.moonlight[i]);
  }
  stops.set(0, moonlightAt(n, a));
  stops.set(1, moonlightAt(n, b));
  return [...stops].sort(([a], [b]) => a - b).map(([offset, opacity]) => ({ offset, opacity }));
}

/** Ordinary and accepted moonlight, split into disjoint bands, in instants so DST cannot change membership. */
export function moonlightBands(n: Pick<Night, 'sunBelow' | 'mf' | 'moonWindows'>): {
  ordinary: Interval[];
  accepted: Interval[];
} {
  const ordinary: Interval[] = [];
  const accepted: Interval[] = [];
  for (const dark of n.sunBelow.astronomical) {
    for (const [a, b] of n.moonWindows[0].above) {
      const start = Math.max(a, dark[0]);
      const end = Math.min(b, dark[1]);
      if (end <= start) continue;
      let cursor = start;
      for (const [c, d] of n.mf) {
        const s = Math.max(start, c);
        const e = Math.min(end, d);
        if (e <= s) continue;
        if (s > cursor) ordinary.push([cursor, s]);
        accepted.push([s, e]);
        cursor = e;
      }
      if (cursor < end) ordinary.push([cursor, end]);
    }
  }
  return { ordinary, accepted };
}
