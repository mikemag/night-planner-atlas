import { CACHE_GENERATION, type CachedMonth } from './night-cache-format';

export const CACHE_DB = 'npa:computed';
export const CACHE_BUDGET = 32 * 1024 * 1024;
export const CACHE_LIMIT = 512;
interface Usage {
  key: string;
  bytes: number;
  usedAt: number;
}
function isUsage(value: unknown): value is Usage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Usage;
  return (
    typeof v.key === 'string' &&
    Number.isFinite(v.bytes) &&
    v.bytes >= 0 &&
    Number.isFinite(v.usedAt)
  );
}
/** Native request callbacks must abort quietly on serialization/quota/corruption failures. */
function guarded(tx: IDBTransaction, work: () => void): () => void {
  return () => {
    try {
      work();
    } catch {
      try {
        tx.abort();
      } catch {
        /* Already finished. */
      }
    }
  };
}
export interface CacheInfo {
  months: number;
  bytes: number;
}

/** Optional, disposable IndexedDB storage. It never accesses the personal-data namespace. */
export class NightCache {
  private connection: Promise<IDBDatabase | null> | null = null;
  private disabled = false;
  private stamp = 0;
  private epochValue = 0;
  get epoch(): number {
    return this.epochValue;
  }
  constructor(
    private budget = CACHE_BUDGET,
    private limit = CACHE_LIMIT,
  ) {}

  private open(): Promise<IDBDatabase | null> {
    if (this.disabled) return Promise.resolve(null);
    let factory: IDBFactory;
    try {
      factory = indexedDB;
    } catch {
      return Promise.resolve(null);
    }
    if (!factory) return Promise.resolve(null);
    return (this.connection ??= new Promise((resolve) => {
      let settled = false;
      const finish = (db: IDBDatabase | null) => {
        if (settled) {
          db?.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (!db) this.disabled = true;
        resolve(db);
      };
      const timer = setTimeout(() => finish(null), 500);
      try {
        const request = factory.open(CACHE_DB, 1);
        request.onupgradeneeded = () => {
          try {
            request.result.createObjectStore('months', { keyPath: 'key' });
            request.result.createObjectStore('usage', { keyPath: 'key' });
          } catch {
            request.transaction?.abort();
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.connection = null;
          };
          finish(db);
        };
        request.onerror = request.onblocked = () => finish(null);
      } catch {
        finish(null);
      }
    }));
  }
  private nextStamp(): number {
    return (this.stamp = Math.max(Date.now(), this.stamp + 1));
  }
  private async transact<T>(
    stores: string[],
    mode: IDBTransactionMode,
    run: (tx: IDBTransaction, set: (value: T) => void) => void,
  ): Promise<T | null> {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      let value: T | null = null,
        settled = false;
      const finish = (result: T | null) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      };
      const timer = setTimeout(() => {
        try {
          tx?.abort();
        } catch {
          /* Already finished. */
        }
        finish(null);
      }, 1000);
      let tx: IDBTransaction | undefined;
      try {
        tx = db.transaction(stores, mode);
        tx.oncomplete = () => finish(value);
        tx.onerror = tx.onabort = () => finish(null);
        run(tx, (v) => {
          value = v;
        });
      } catch {
        try {
          tx?.abort();
        } catch {
          /* Already finished. */
        }
        finish(null);
      }
    });
  }
  async get(keys: string[]): Promise<Map<string, unknown>> {
    const found = await this.transact<Map<string, unknown>>(['months'], 'readonly', (tx, set) => {
      const records = new Map<string, unknown>();
      set(records);
      for (const key of keys) {
        const q = tx.objectStore('months').get(key);
        q.onsuccess = () => {
          if (q.result) records.set(key, q.result);
        };
      }
    });
    if (found?.size)
      void this.transact(['usage'], 'readwrite', (tx, set) => {
        const store = tx.objectStore('usage');
        for (const key of found.keys()) {
          const q = store.get(key);
          q.onsuccess = guarded(tx, () => {
            if (isUsage(q.result)) store.put({ ...q.result, usedAt: this.nextStamp() });
          });
        }
        set(true);
      });
    return found ?? new Map();
  }
  async put(records: CachedMonth[], epoch = this.epoch): Promise<boolean> {
    if (epoch !== this.epoch) return false;
    const write = () =>
      this.transact<boolean>(['months', 'usage'], 'readwrite', (tx, set) => {
        if (epoch !== this.epoch) {
          set(false);
          return;
        }
        const months = tx.objectStore('months'),
          usage = tx.objectStore('usage'),
          q = usage.getAll();
        q.onsuccess = guarded(tx, () => {
          const valid = (q.result as unknown[]).filter(isUsage);
          const entries = new Map<string, Usage>(valid.map((v) => [v.key, v]));
          this.stamp = Math.max(this.stamp, ...valid.map((v) => v.usedAt));
          for (const r of records)
            if (r.bytes <= this.budget)
              entries.set(r.key, { key: r.key, bytes: r.bytes, usedAt: this.nextStamp() });
          const sorted = [...entries.values()].sort((a, b) => a.usedAt - b.usedAt);
          let bytes = sorted.reduce((sum, v) => sum + v.bytes, 0),
            count = sorted.length;
          for (const entry of sorted) {
            if (bytes <= this.budget && count <= this.limit) break;
            entries.delete(entry.key);
            months.delete(entry.key);
            usage.delete(entry.key);
            bytes -= entry.bytes;
            count--;
          }
          for (const record of records)
            if (entries.has(record.key) && record.bytes <= this.budget) {
              months.put(record);
              usage.put(entries.get(record.key)!);
            }
          set(true);
        });
      });
    const first = await write();
    if (first !== null) return first;
    // Storage pressure: discard disposable entries and retry just once.
    await this.transact(['months', 'usage'], 'readwrite', (tx, set) => {
      tx.objectStore('months').clear();
      tx.objectStore('usage').clear();
      set(true);
    });
    const retried = await write();
    if (retried === null) this.disabled = true;
    return retried === true;
  }
  async info(): Promise<CacheInfo | null> {
    return this.transact<CacheInfo>(['usage'], 'readonly', (tx, set) => {
      const q = tx.objectStore('usage').getAll();
      q.onsuccess = guarded(tx, () =>
        set({
          months: (q.result as unknown[]).filter(isUsage).length,
          bytes: (q.result as unknown[]).filter(isUsage).reduce((sum, v) => sum + v.bytes, 0),
        }),
      );
    });
  }
  async clear(): Promise<boolean> {
    this.epochValue++;
    (await this.connection)?.close();
    this.connection = null;
    this.disabled = false;
    return (
      (await this.transact<boolean>(['months', 'usage'], 'readwrite', (tx, set) => {
        tx.objectStore('months').clear();
        tx.objectStore('usage').clear();
        set(true);
      })) === true
    );
  }
}
export const nightCache = new NightCache();
export { CACHE_GENERATION };
