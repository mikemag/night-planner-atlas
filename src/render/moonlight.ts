import type { Interval, Night } from '../model/night';

/** Ordinary and accepted moonlight, split into disjoint bands, in instants so DST cannot change membership. */
export function moonlightBands(n: Pick<Night, 'td' | 'mf' | 'moonWindows'>): {
  ordinary: Interval[];
  accepted: Interval[];
} {
  const ordinary: Interval[] = [];
  const accepted: Interval[] = [];
  if (n.td) {
    for (const [a, b] of n.moonWindows[0].above) {
      const start = Math.max(a, n.td[0]);
      const end = Math.min(b, n.td[1]);
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
