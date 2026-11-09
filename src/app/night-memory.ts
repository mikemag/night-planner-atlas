import type { Night, Site } from '../model/night';
import { nightDates } from '../model/range';
import { monthKey } from './night-cache-format';

/** Bounded, tab-only sharing, including partial months still being computed by another caller. */
export class NightMemory {
  private months = new Map<string, Map<string, Night>>();

  constructor(private limit = 32) {}

  clear(): void {
    this.months.clear();
  }

  get(site: Site, id: string): Night | undefined {
    const [y, m] = id.split('-').map(Number);
    const key = monthKey(site, y, m);
    const month = this.months.get(key);
    if (!month) return;
    this.months.delete(key);
    this.months.set(key, month);
    return month.get(id);
  }

  put(site: Site, night: Night): void {
    const key = monthKey(site, night.y, night.m);
    const month = this.months.get(key) ?? new Map<string, Night>();
    month.set(night.id, night);
    this.months.delete(key);
    this.months.set(key, month);
    while (this.months.size > this.limit) this.months.delete(this.months.keys().next().value!);
  }

  hasMonth(site: Site, y: number, m: number): boolean {
    return this.months.get(monthKey(site, y, m))?.size === nightDates({ y, m, count: 1 }).length;
  }
}
