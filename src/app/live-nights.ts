import { deriveNight, type Night, type Site, type Thresholds } from '../model/night';
import { tonightId, type NightRange } from '../model/range';
import { nightStatus, type NightStatus } from '../model/site-clock';
import { MS_D, TimeZone } from '../model/time';
import { computeCachedNights } from './compute-cached';
import { siteKey } from './night-cache-format';

/** Retain current nights while browsing other years; acquire only missing months via the shared cache. */
export class LiveNights {
  private identity = '';
  private generation = 0;
  private source = new Map<string, Night>();
  private seenRange: NightRange | null = null;
  private rows: Night[] = [];
  private thresholds = '';
  private pending: Promise<void> | null = null;
  private failed = false;

  constructor(private changed: () => void) {}

  private accept(nights: readonly Night[], now: number): void {
    for (const [id, n] of this.source)
      if (n.nextNoon <= now || n.noon > now + 400 * MS_D) this.source.delete(id);
    for (const n of nights)
      if (n.nextNoon > now && n.noon <= now + 400 * MS_D) this.source.set(n.id, n);
    this.thresholds = '';
  }

  read(site: Site, th: Thresholds, now: number, range: NightRange | null): NightStatus | null {
    const identity = siteKey(site);
    if (identity !== this.identity) {
      this.identity = identity;
      this.generation++;
      this.source.clear();
      this.rows = [];
      this.seenRange = null;
      this.thresholds = '';
      this.pending = null;
      this.failed = false;
    }
    if (range && siteKey(range.site) === identity && range !== this.seenRange) {
      this.seenRange = range;
      this.accept(range.nights, now);
      this.failed = false;
    }
    const thresholds = `${th.moonAlt}:${th.crescent}`;
    if (thresholds !== this.thresholds) {
      const visible = new Set(range && siteKey(range.site) === identity ? range.nights : []);
      this.rows = [...this.source.values()]
        .sort((a, b) => a.noon - b.noon)
        .map((n) => {
          // The visible range has already derived these exact windows. Other retained nights
          // reuse its same derivation function; only cheap Moon-setting arithmetic is repeated.
          if (visible.has(n)) return n;
          const copy = { ...n };
          deriveNight(copy, th);
          return copy;
        });
      this.thresholds = thresholds;
    }
    return nightStatus(this.rows, now);
  }

  finished(status: NightStatus | null, now: number): boolean {
    return !!status && status.through >= now + 370 * MS_D;
  }

  get unavailable(): boolean {
    return this.failed;
  }

  /** Share background work with chart loading; stale site requests cannot publish their results. */
  extend(site: Site, status: NightStatus | null, now: number): void {
    if (
      this.pending ||
      this.failed ||
      this.finished(status, now) ||
      (status?.solar && !status.usablePending)
    )
      return;
    const generation = this.generation;
    const tz = new TimeZone(site.tz);
    const [y, m] = tonightId(status?.through ?? now, tz)
      .split('-')
      .map(Number);
    const request = computeCachedNights(
      site,
      { y, m, count: 1 },
      {
        isCancelled: () => generation !== this.generation,
      },
    )
      .then((nights) => {
        if (!nights || generation !== this.generation) return;
        this.accept(nights, Date.now());
      })
      .catch(() => {
        // Ephemeris errors may contain private site inputs; never log them.
        if (generation === this.generation) this.failed = true;
      })
      .finally(() => {
        if (this.pending !== request) return;
        this.pending = null;
        this.changed();
      });
    this.pending = request;
  }
}
