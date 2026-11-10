import { Observer } from 'astronomy-engine';
import { computeSolarNight, type SolarNight, type Night, type Site } from '../model/night';
import { computeNights, nightDates, type ComputeOptions, type RangeSpec } from '../model/range';
import { TimeZone } from '../model/time';
import { pad2 } from '../model/format';
import { rangeMonths, siteKey } from './night-cache-format';
import type { NightReply, NightRequest, NightWork } from './night-worker-protocol';

type Options = Omit<ComputeOptions, 'spec'>;
interface Pending {
  finish: (night: NightReply | null) => void;
  promise: Promise<NightReply | null>;
  id: number;
}

/** One shared worker, with at most one outstanding night per consumer and shared in-flight work. */
export class BackgroundNights {
  private worker: Worker | null = null;
  private disabled = false;
  private serial = 0;
  private pending = new Map<string, Pending>();

  constructor(
    private createWorker = () =>
      new Worker(new URL('./nights.worker.ts', import.meta.url), { type: 'module' }),
  ) {}

  private stop(): void {
    this.disabled = true;
    this.worker?.terminate();
    this.worker = null;
    for (const request of this.pending.values()) request.finish(null);
  }

  private request(site: Site, work: NightWork): Promise<NightReply | null> {
    if (this.disabled) return Promise.resolve(null);
    const key = JSON.stringify([siteKey(site), 'date' in work ? work.date : work.dates]);
    const existing = this.pending.get(key);
    if (existing) return existing.promise;
    try {
      if (!this.worker) {
        this.worker = this.createWorker();
        this.worker.onerror = (event) => {
          event.preventDefault();
          this.stop();
        };
        this.worker.onmessageerror = () => this.stop();
        this.worker.onmessage = ({ data }: MessageEvent<NightReply>) => {
          const request = [...this.pending.values()].find((r) => r.id === data.id);
          if (!request) return;
          if ('failed' in data) this.stop();
          else request.finish(data);
        };
      }
      const id = ++this.serial;
      let finish!: Pending['finish'];
      const promise = new Promise<NightReply | null>((resolve) => {
        // A failed startup must not strand the loading state indefinitely.
        const timer = setTimeout(() => this.stop(), 15_000);
        finish = (night) => {
          clearTimeout(timer);
          this.pending.delete(key);
          resolve(night);
        };
      });
      this.pending.set(key, { id, promise, finish });
      const { lat, lon, elevation, tz } = site;
      const message: NightRequest = { id, site: { lat, lon, elevation, tz }, ...work };
      this.worker.postMessage(message);
      return promise;
    } catch {
      this.stop();
      return Promise.resolve(null);
    }
  }

  /** Exact full-range solar geometry, in cancellable month jobs; cached nights need no work. */
  async prepare(
    site: Site,
    spec: RangeSpec,
    opts: Options,
  ): Promise<Map<string, SolarNight> | null> {
    const solar = new Map<string, SolarNight>();
    const tz = new TimeZone(site.tz);
    const observer = new Observer(site.lat, site.lon, site.elevation ?? 0);
    let sliceStart = performance.now();
    for (const month of rangeMonths(spec)) {
      if (opts.isCancelled?.()) return null;
      const missing: Array<[number, number, number]> = [];
      for (const date of nightDates({ ...month, count: 1 })) {
        const id = `${date[0]}-${pad2(date[1])}-${pad2(date[2])}`;
        const cached = opts.cachedNights?.get(id);
        if (cached) solar.set(id, cached);
        else missing.push(date);
      }
      if (!missing.length) continue;
      const reply =
        typeof Worker !== 'undefined' ? await this.request(site, { dates: missing }) : null;
      if (opts.isCancelled?.()) return null;
      if (reply && 'solar' in reply) {
        for (const raw of reply.solar) solar.set(raw.id, { ...raw, tz });
      } else {
        for (const date of missing) {
          if (opts.isCancelled?.()) return null;
          const night = computeSolarNight(observer, tz, ...date);
          solar.set(night.id, night);
          if (performance.now() - sliceStart >= (opts.sliceMs ?? 24)) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            sliceStart = performance.now();
          }
        }
      }
    }
    return solar;
  }

  async compute(site: Site, spec: RangeSpec, opts: Options = {}): Promise<Night[] | null> {
    if (this.disabled || typeof Worker === 'undefined') return computeNights(site, spec, opts);
    const tz = new TimeZone(site.tz);
    const dates = nightDates(spec),
      nights: Night[] = [];
    const completed = new Map<string, Night>();
    let sliceStart = performance.now();
    const sliceMs = opts.sliceMs ?? 24;
    for (const date of dates) {
      if (opts.isCancelled?.()) return null;
      const [y, m, d] = date;
      const id = `${y}-${pad2(m)}-${pad2(d)}`;
      let night = opts.cachedNights?.get(id);
      let fresh = false;
      if (!night) {
        const prepared = opts.solarNights?.get(id);
        const solar = prepared ? { ...prepared, tz: undefined } : undefined;
        const reply = await this.request(site, { date, solar });
        if (opts.isCancelled?.()) return null;
        if (!reply || !('night' in reply)) {
          // Keep every completed night and resume the original sliced path after a worker failure.
          return computeNights(site, spec, {
            ...opts,
            cachedNights: { get: (id) => opts.cachedNights?.get(id) ?? completed.get(id) },
          });
        }
        // Another consumer may have published this shared request while we were awaiting it.
        night = opts.cachedNights?.get(id);
        fresh = !night;
        night ??= { ...reply.night, tz };
      }
      nights.push(night);
      completed.set(id, night);
      opts.onNight?.(night, fresh);
      if (performance.now() - sliceStart >= sliceMs) {
        opts.onProgress?.(nights.length, dates.length);
        // Worker messages already yield to input/paint. Only long cache-only runs need a timer.
        if (!fresh) await new Promise<void>((resolve) => setTimeout(resolve, 0));
        sliceStart = performance.now();
      }
    }
    opts.onProgress?.(nights.length, dates.length);
    return opts.isCancelled?.() ? null : nights;
  }
}

export const backgroundNights = new BackgroundNights();
