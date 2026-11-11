import type { Night, Site } from '../model/night';
import { nightDates } from '../model/range';
import { monthKey, packMonth } from './night-cache-format';

export const MEMORY_CACHE_BUDGET = 32 * 1024 * 1024;
export const MEMORY_CACHE_LIMIT = 512;
interface MemoryMonth {
  nights: Map<string, { night: Night; bytes: number }>;
  bytes: number;
}

/** Bounded, tab-only sharing, including partial months still being computed by another caller. */
export class NightMemory {
  private months = new Map<string, MemoryMonth>();
  private bytes = 0;

  constructor(
    private limit = MEMORY_CACHE_LIMIT,
    private budget = MEMORY_CACHE_BUDGET,
  ) {}

  clear(): void {
    this.months.clear();
    this.bytes = 0;
  }

  get(site: Site, id: string): Night | undefined {
    const [y, m] = id.split('-').map(Number);
    const key = monthKey(site, y, m);
    const month = this.months.get(key);
    if (!month) return;
    this.months.delete(key);
    this.months.set(key, month);
    return month.nights.get(id)?.night;
  }

  put(site: Site, night: Night): void {
    const key = monthKey(site, night.y, night.m);
    const month: MemoryMonth = this.months.get(key) ?? { nights: new Map(), bytes: 0 };
    const old = month.nights.get(night.id);
    if (old?.night !== night) {
      // Match the persistent cache's logical payload estimate, not total JavaScript heap.
      // Hits only touch recency; re-deriving thresholds does not change this base payload.
      const bytes = packMonth(key, [night]).bytes;
      if (bytes > this.budget) return;
      const delta = bytes - (old?.bytes ?? 0);
      month.nights.set(night.id, { night, bytes });
      month.bytes += delta;
      this.bytes += delta;
    }
    this.months.delete(key);
    this.months.set(key, month);
    while (this.months.size > this.limit || this.bytes > this.budget) {
      const oldest = this.months.keys().next().value!;
      this.bytes -= this.months.get(oldest)!.bytes;
      this.months.delete(oldest);
    }
  }

  hasMonth(site: Site, y: number, m: number): boolean {
    return (
      this.months.get(monthKey(site, y, m))?.nights.size === nightDates({ y, m, count: 1 }).length
    );
  }
}
