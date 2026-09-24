/** Milliseconds per minute, hour and day. */
export const MS_M = 60e3;
export const MS_H = 3600e3;
export const MS_D = 86400e3;

export interface WallParts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
}

/**
 * Local clock time in one IANA zone.
 *
 * "Wall" times are local clock readings encoded as if they were UTC milliseconds, so
 * `Date.UTC(y, m - 1, d, 12)` is local noon on that date. Offsets are cached per UTC
 * hour, which is exact wherever clock changes fall on a UTC hour (most zones).
 */
export class TimeZone {
  readonly name: string;
  private readonly parts: Intl.DateTimeFormat;
  private readonly cache = new Map<number, number>();

  constructor(name: string) {
    this.name = name;
    this.parts = new Intl.DateTimeFormat('en-US', {
      timeZone: name,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  }

  /** Minutes to add to UTC to get local clock time at the instant `ms`. */
  offsetMin(ms: number): number {
    const key = Math.floor(ms / MS_H);
    let v = this.cache.get(key);
    if (v === undefined) {
      const p: Record<string, string> = {};
      for (const x of this.parts.formatToParts(new Date(key * MS_H))) p[x.type] = x.value;
      const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      v = Math.round((wall - key * MS_H) / MS_M);
      this.cache.set(key, v);
    }
    return v;
  }

  /** The instant at which local clocks read the wall time `wall`. */
  utcForWall(wall: number): number {
    let t = wall - this.offsetMin(wall) * MS_M;
    t = wall - this.offsetMin(t) * MS_M;
    return t;
  }

  /** Local calendar date and clock time at the instant `ms`. */
  wallParts(ms: number): WallParts {
    const w = new Date(ms + this.offsetMin(ms) * MS_M);
    return {
      y: w.getUTCFullYear(),
      m: w.getUTCMonth() + 1,
      d: w.getUTCDate(),
      h: w.getUTCHours(),
      mi: w.getUTCMinutes(),
    };
  }
}
