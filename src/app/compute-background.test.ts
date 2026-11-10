import { afterEach, expect, it, vi } from 'vitest';
import { Observer } from 'astronomy-engine';
import { BackgroundNights } from './compute-background';
import { computeNight, computeSolarNight, type Night } from '../model/night';
import { TimeZone } from '../model/time';
import { DEFAULT_SITES } from './default-sites';
import type { NightReply, NightRequest } from './night-worker-protocol';

const site = DEFAULT_SITES[0];
const spec = { y: 2026, m: 10, count: 1 };
const tz = new TimeZone(site.tz);
const observer = new Observer(site.lat, site.lon, 0);
const raw = computeNight(observer, tz, 2026, 10, 1);

class TestWorker {
  onmessage: ((event: MessageEvent<NightReply>) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((request: NightRequest) => {
    if ('dates' in request) {
      const solar = request.dates.map((date) => {
        const { tz: zone, ...night } = computeSolarNight(observer, tz, ...date);
        void zone;
        return night;
      });
      queueMicrotask(() =>
        this.onmessage?.({ data: { id: request.id, solar } } as MessageEvent<NightReply>),
      );
      return;
    }
    const { tz: zone, ...night } = computeNight(observer, tz, ...request.date);
    void zone;
    queueMicrotask(() =>
      this.onmessage?.({ data: { id: request.id, night } } as MessageEvent<NightReply>),
    );
  });
}
function setup() {
  const worker = new TestWorker();
  vi.stubGlobal('Worker', TestWorker);
  const computer = new BackgroundNights(() => worker as unknown as Worker);
  return { worker, computer };
}
afterEach(() => vi.unstubAllGlobals());

it('shares in-flight nights, restores TimeZone, and sends only physical inputs', async () => {
  const { worker, computer } = setup();
  const memory = new Map<string, Night>();
  let fresh = 0;
  const opts = {
    cachedNights: memory,
    onNight: (night: Night, computed: boolean) => {
      memory.set(night.id, night);
      if (computed) fresh++;
    },
  };
  const [first, second] = await Promise.all([
    computer.compute(site, spec, opts),
    computer.compute(site, spec, opts),
  ]);
  expect(worker.postMessage).toHaveBeenCalledTimes(31);
  expect(worker.postMessage.mock.calls[0][0]).toEqual({
    id: 1,
    site: { lat: site.lat, lon: site.lon, tz: site.tz, elevation: site.elevation },
    date: [2026, 10, 1],
  });
  expect(fresh).toBe(31);
  for (let i = 0; i < 31; i++) expect(first![i]).toBe(second![i]);
  expect(memory.get(raw.id)?.tz).toBeInstanceOf(TimeZone);
  expect(memory.get(raw.id)?.moonAlt).toEqual(raw.moonAlt);
});

it('abandons a stale request after its outstanding night, without queuing the rest', async () => {
  const { worker, computer } = setup();
  let cancelled = false;
  worker.postMessage.mockImplementation((request) => {
    cancelled = true;
    const { tz: zone, ...night } = raw;
    void zone;
    queueMicrotask(() =>
      worker.onmessage?.({ data: { id: request.id, night } } as MessageEvent<NightReply>),
    );
  });
  const onNight = vi.fn();
  expect(await computer.compute(site, spec, { isCancelled: () => cancelled, onNight })).toBeNull();
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  expect(onNight).not.toHaveBeenCalled();
});

it('a worker startup timeout settles all consumers and enables sliced fallback', async () => {
  vi.useFakeTimers();
  try {
    const { worker, computer } = setup();
    worker.postMessage.mockImplementation(() => {});
    let cancelled = false;
    const pending = computer.compute(site, spec, { isCancelled: () => cancelled });
    cancelled = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toBeNull();
    expect(worker.terminate).toHaveBeenCalledOnce();
    // Cancellation on the fallback path is still honored without starting a replacement worker.
    expect(await computer.compute(site, spec, { isCancelled: () => true })).toBeNull();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
