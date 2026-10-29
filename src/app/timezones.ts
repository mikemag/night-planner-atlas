let nextId = 0;
let ready: Promise<Worker> | null = null;
const pending = new Map<
  number,
  { resolve: (zones: string[]) => void; reject: (error: Error) => void }
>();
const unavailable = () =>
  new Error('Offline time-zone lookup is unavailable. Enter an IANA zone manually.');

/** Prepare all lookup bytes at startup so even a new coordinate works after going offline. */
export function prepareTimeZones(): Promise<Worker> {
  if (!ready)
    ready = new Promise<Worker>((resolve, reject) => {
      const worker = new Worker(new URL('./timezones.worker.ts', import.meta.url), {
        type: 'module',
      });
      const fail = () => {
        reject(unavailable());
        for (const request of pending.values()) request.reject(unavailable());
        pending.clear();
        worker.terminate();
        ready = null;
      };
      worker.onerror = fail;
      worker.onmessage = (
        event: MessageEvent<{ ready?: boolean; id?: number; zones?: string[]; error?: boolean }>,
      ) => {
        if (event.data.ready === true) resolve(worker);
        else if (event.data.ready === false) fail();
        else if (event.data.id != null) {
          const request = pending.get(event.data.id);
          pending.delete(event.data.id);
          if (event.data.error || !event.data.zones) request?.reject(unavailable());
          else request?.resolve(event.data.zones);
        }
      };
    });
  return ready;
}

/** Coordinates are sent only to our same-origin worker, never to a remote lookup service. */
export async function lookupTimeZones(lat: number, lon: number): Promise<string[]> {
  const worker = await prepareTimeZones();
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, lat, lon });
  });
}
