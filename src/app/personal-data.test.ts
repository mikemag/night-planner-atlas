import { describe, expect, it } from 'vitest';
import {
  decodePersonalData,
  EditConflict,
  freshPersonalData,
  PERSONAL_KEY,
  PersonalStorage,
  type DataFormat,
} from './personal-data';

function fixture(format?: DataFormat) {
  const entries = new Map<string, string>();
  let fail = false;
  let pending = Promise.resolve();
  const exclusive = <T>(work: () => T | Promise<T>): Promise<T> => {
    const result = pending.then(work);
    pending = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const access = () => ({
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error();
      entries.set(key, value);
    },
  });
  return {
    entries,
    storage: new PersonalStorage(access, exclusive, format),
    other: () => new PersonalStorage(access, exclusive, format),
    fail: () => {
      fail = true;
    },
    read: () => JSON.parse(entries.get(PERSONAL_KEY)!),
  };
}
describe('personal data', () => {
  it('does not import any former keys or write defaults on read', () => {
    const f = fixture();
    f.entries.set('npa:favorites', 'old');
    expect(f.storage.snapshot()).toEqual(freshPersonalData());
    expect(f.entries.size).toBe(1);
  });
  it.each([
    '{broken',
    '{"version":99}',
    JSON.stringify({ ...freshPersonalData(), active: { id: 'missing' } }),
    JSON.stringify({ ...freshPersonalData(), preferences: { moonAlt: 7 } }),
  ])('preserves unreadable data: %s', async (raw) => {
    const f = fixture();
    f.entries.set(PERSONAL_KEY, raw);
    const result = await f.storage.update((d) => {
      d.sites[0].name = 'Temporary';
    });
    expect(result.saved).toBe(false);
    expect(result.message).toContain('left unchanged');
    expect(f.entries.get(PERSONAL_KEY)).toBe(raw);
    expect(f.storage.snapshot().sites[0].name).toBe('Temporary');
  });
  it('serializes unrelated edits across tabs, always starting from the latest state', async () => {
    const f = fixture(),
      b = f.other();
    await Promise.all([
      f.storage.update((d) => {
        d.sites[0].name = 'My park';
      }),
      b.update((d) => {
        d.preferences.focus = 0;
      }),
    ]);
    expect(f.read().sites[0].name).toBe('My park');
    expect(f.read().preferences.focus).toBe(0);
    expect(f.read().revision).toBe(2);
    expect(f.storage.snapshot()).toEqual(b.snapshot());
  });
  it('does not overwrite newer data after a rollback or a stale draft', async () => {
    const f = fixture();
    await f.storage.update((d) => {
      d.preferences.moonAlt = 5;
    });
    const before = f.entries.get(PERSONAL_KEY);
    const conflict = await f.storage.update(() => {
      throw new EditConflict();
    });
    expect(conflict.conflict).toBe(true);
    expect(f.entries.get(PERSONAL_KEY)).toBe(before);
    const future = JSON.stringify({ ...f.read(), version: 2 });
    f.entries.set(PERSONAL_KEY, future);
    await f.storage.update((d) => {
      d.preferences.focus = 3;
    });
    expect(f.entries.get(PERSONAL_KEY)).toBe(future);
  });
  it('keeps a failed write temporary without erasing the last saved state', async () => {
    const f = fixture();
    await f.storage.update((d) => {
      d.preferences.crescent = 0.1;
    });
    const before = f.entries.get(PERSONAL_KEY);
    f.fail();
    expect(
      (
        await f.storage.update((d) => {
          d.preferences.focus = 7;
        })
      ).saved,
    ).toBe(false);
    expect(f.entries.get(PERSONAL_KEY)).toBe(before);
    expect(f.storage.snapshot().preferences).toEqual({ crescent: 0.1, focus: 7 });
  });
  it('uses tab-only state when storage or cross-tab locking is unavailable', async () => {
    const s = new PersonalStorage(() => {
      throw new Error();
    }, null);
    expect(
      (
        await s.update((d) => {
          d.preferences.theme = 'dark';
        })
      ).saved,
    ).toBe(false);
    expect(s.snapshot().preferences.theme).toBe('dark');
  });
  it('respects all deliberate starter removals and later starter revisions', () => {
    const value = freshPersonalData();
    value.sites = [];
    value.active = { site: freshPersonalData().sites[0] };
    for (const revision of [1, 2]) {
      value.starterVersion = revision;
      expect(decodePersonalData(JSON.stringify(value)).value).toEqual(value);
    }
  });
  it('merges a starter delta once without replacing edits or selection', () => {
    const value = freshPersonalData();
    value.starterVersion = 0;
    value.sites = value.sites.slice(0, 1);
    value.sites[0].name = 'My park';
    const first = decodePersonalData(JSON.stringify(value));
    expect(first.migrated).toBe(true);
    expect(first.value.sites).toHaveLength(6);
    expect(first.value.sites[0].name).toBe('My park');
    first.value.sites.pop();
    expect(decodePersonalData(JSON.stringify(first.value)).migrated).toBe(false);
  });
});
describe('migration and recovery contract', () => {
  // A future migration fixture exercises the runner without shipping a legacy migration.
  const format: DataFormat = {
    version: 2,
    migrations: new Map([[1, (value) => ({ ...value, version: 2 })]]),
  };
  it('backs up the exact source, validates the result and applies migration only once', async () => {
    const f = fixture(format),
      source = JSON.stringify(freshPersonalData());
    f.entries.set(PERSONAL_KEY, source);
    await f.storage.initialize();
    expect(f.read().version).toBe(2);
    expect(f.entries.get(PERSONAL_KEY + ':backup')).toBe(source);
    expect(f.read().revision).toBe(1);
    await f.storage.initialize();
    expect(f.read().revision).toBe(1);
  });
  it('preserves the source if either backup or migration writing fails', async () => {
    const f = fixture(format),
      raw = JSON.stringify(freshPersonalData());
    f.entries.set(PERSONAL_KEY, raw);
    f.fail();
    await f.storage.initialize();
    expect(f.entries.get(PERSONAL_KEY)).toBe(raw);
    expect(f.storage.snapshot().version).toBe(2);
    expect(f.storage.status()).toContain('temporary');
  });
  it('rejects missing, throwing and non-advancing migrations', () => {
    const raw = JSON.stringify(freshPersonalData());
    for (const migrations of [
      new Map(),
      new Map([
        [
          1,
          () => {
            throw new Error();
          },
        ],
      ]),
      new Map([[1, (v: Record<string, unknown>) => v]]),
    ])
      expect(decodePersonalData(raw, { version: 2, migrations }).writable).toBe(false);
  });
  it('keeps a recoverable copy before an explicitly requested replacement', async () => {
    const f = fixture();
    await f.storage.update((d) => {
      d.sites[0].name = 'Original';
    });
    const raw = f.entries.get(PERSONAL_KEY);
    await f.storage.update((d) => {
      d.sites = [];
      d.active = { site: freshPersonalData().sites[0] };
    }, true);
    expect(f.entries.get(PERSONAL_KEY + ':backup')).toBe(raw);
    expect(f.read().sites).toEqual([]);
  });
});
