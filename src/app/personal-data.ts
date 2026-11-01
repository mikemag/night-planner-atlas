import { DEFAULT_SITES } from './default-sites';
import { isFavorite, siteRecord, type Favorite } from './site-book';
import { isSite } from '../model/site-input';
import type { Site } from '../model/night';

/** This namespace deliberately ignores every pre-versioning npa: key. */
export const PERSONAL_KEY = 'npa:personal';
export const PERSONAL_VERSION = 1;
export const STARTER_VERSION = 1;
export const PREFERENCES = {
  view: ['river', 'calendar', 'lunations', 'notes'],
  focus: [0, 3, 5, 7, 10],
  moonAlt: [0, 5, 10, 15],
  crescent: [0, 0.1, 0.2, 0.3],
  calOrient: ['v', 'h'],
  calZoom: ['month', 'week', 'year'],
  riverZoom: ['year', 'month'],
  theme: ['system', 'light', 'dark', 'observing'],
} as const;
export type Preferences = {
  -readonly [K in keyof typeof PREFERENCES]?: (typeof PREFERENCES)[K][number];
};
export interface PersonalData {
  version: number;
  revision: number;
  starterVersion: number;
  sites: Favorite[];
  active: { id: string } | { site: Site };
  preferences: Preferences;
}
export function freshPersonalData(): PersonalData {
  return {
    version: PERSONAL_VERSION,
    revision: 0,
    starterVersion: STARTER_VERSION,
    sites: DEFAULT_SITES.map((site) => ({ ...site })),
    active: { id: DEFAULT_SITES[0].id },
    preferences: {},
  };
}
export function currentSite(value: PersonalData): Site {
  const active = value.active;
  return siteRecord(
    'id' in active ? value.sites.find((site) => site.id === active.id)! : active.site,
  );
}
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const counter = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
export function isPreferences(value: unknown): value is Preferences {
  return (
    object(value) &&
    Object.entries(value).every(([key, v]) => {
      const choices = Object.hasOwn(PREFERENCES, key)
        ? (PREFERENCES[key as keyof Preferences] as readonly unknown[])
        : undefined;
      return choices ? choices.includes(v) : true;
    })
  );
}
export function isPersonalData(value: unknown, version = PERSONAL_VERSION): value is PersonalData {
  if (
    !object(value) ||
    value.version !== version ||
    !counter(value.revision) ||
    !counter(value.starterVersion) ||
    !Array.isArray(value.sites) ||
    !value.sites.every(isFavorite) ||
    new Set(value.sites.map((s) => s.id)).size !== value.sites.length ||
    !isPreferences(value.preferences) ||
    !object(value.active)
  )
    return false;
  const active = value.active;
  return 'id' in active
    ? typeof active.id === 'string' && value.sites.some((s) => s.id === active.id)
    : isSite(active.site);
}
/** Each step converts version n to n+1; no legacy import ships in this namespace. */
export type Migration = (value: Record<string, unknown>) => Record<string, unknown>;
export interface DataFormat {
  version: number;
  migrations: ReadonlyMap<number, Migration>;
}
const FORMAT: DataFormat = { version: PERSONAL_VERSION, migrations: new Map() };
/** Add only a revision's new starters; never resurrect removals from an earlier revision. */
export function mergeStarters(value: PersonalData): boolean {
  if (value.starterVersion >= STARTER_VERSION) return false;
  for (const site of DEFAULT_SITES) {
    // All current entries arrived in revision 1. Future revisions add their own delta here.
    if (
      value.starterVersion < 1 &&
      !value.sites.some((s) => s.id === site.id || (s.lat === site.lat && s.lon === site.lon))
    )
      value.sites.push({ ...site });
  }
  value.starterVersion = STARTER_VERSION;
  return true;
}
export function decodePersonalData(
  raw: string | null | undefined,
  format = FORMAT,
): {
  value: PersonalData;
  writable: boolean;
  migrated: boolean;
  message: string | null;
} {
  if (raw === null)
    return { value: freshPersonalData(), writable: true, migrated: false, message: null };
  try {
    if (raw === undefined) throw new Error();
    let value: unknown = JSON.parse(raw);
    let migrated = false;
    while (object(value) && counter(value.version) && value.version < format.version) {
      const step = format.migrations.get(value.version);
      if (!step) throw new Error();
      const version = value.version;
      const next = step(value);
      if (next.version !== version + 1) throw new Error();
      value = next;
      migrated = true;
    }
    if (!isPersonalData(value, format.version)) throw new Error();
    migrated = mergeStarters(value) || migrated;
    return { value, writable: true, migrated, message: null };
  } catch {
    return {
      value: freshPersonalData(),
      writable: false,
      migrated: false,
      message:
        raw === undefined
          ? 'Browser storage is unavailable. Changes are temporary and cannot be kept after closing.'
          : 'Saved data could not be read or uses a newer format. It was left unchanged; changes are temporary in this tab. Reload with a compatible app to save.',
    };
  }
}
export class EditConflict extends Error {
  constructor() {
    super(
      'This site or saved data changed in another tab. Your draft is still here; reopen the latest saved data before trying again.',
    );
  }
}
export interface SaveResult {
  saved: boolean;
  conflict: boolean;
  message: string | null;
}
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>;
type Exclusive = <T>(work: () => T | Promise<T>) => Promise<T>;
/** Validated, locked edits to the latest document; failures keep an explicit tab-only copy. */
export class PersonalStorage {
  private temporary = false;
  private value: PersonalData | null = null;
  private message: string | null = null;
  private listeners = new Set<() => void>();
  private pending = Promise.resolve();
  constructor(
    private access: StorageAccess = () => localStorage,
    private exclusive: Exclusive | null = typeof navigator !== 'undefined' && navigator.locks
      ? (work) => navigator.locks.request(PERSONAL_KEY, work)
      : null,
    private format = FORMAT,
  ) {}
  private raw(): string | null | undefined {
    try {
      return this.access().getItem(PERSONAL_KEY);
    } catch {
      return undefined;
    }
  }
  snapshot(): PersonalData {
    if (!this.temporary) {
      const decoded = decodePersonalData(this.raw(), this.format);
      this.value = decoded.value;
      this.message = decoded.message;
    }
    return structuredClone(this.value ?? freshPersonalData());
  }
  status(): string | null {
    this.snapshot();
    return this.message;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  refresh(): void {
    this.snapshot();
    for (const listener of this.listeners) listener();
  }
  async initialize(): Promise<void> {
    if (decodePersonalData(this.raw(), this.format).migrated) await this.update(() => {});
  }
  stored(backup = false): string | null | undefined {
    try {
      return this.access().getItem(PERSONAL_KEY + (backup ? ':backup' : ''));
    } catch {
      return undefined;
    }
  }
  update(edit: (draft: PersonalData) => void, backup = false): Promise<SaveResult> {
    let result: SaveResult;
    const perform = () => {
      const raw = this.raw();
      const decoded = decodePersonalData(raw, this.format);
      const draft = this.temporary ? this.snapshot() : decoded.value;
      try {
        edit(draft);
      } catch (error) {
        if (error instanceof EditConflict)
          return { saved: false, conflict: true, message: error.message };
        throw error;
      }
      if (!isPersonalData(draft, this.format.version)) throw new Error('Invalid personal data');
      draft.revision++;
      if (!counter(draft.revision)) throw new EditConflict();
      let saved = false;
      let message = decoded.message;
      if (!this.temporary && decoded.writable && this.exclusive) {
        try {
          if ((decoded.migrated || backup) && raw != null)
            this.access().setItem(PERSONAL_KEY + ':backup', raw);
          this.access().setItem(PERSONAL_KEY, JSON.stringify(draft));
          saved = true;
        } catch {
          /* The original record survives a failed atomic setItem. */
        }
      }
      if (!saved) {
        this.temporary = true;
        message ??=
          'Changes are temporary and cannot be kept after closing because browser storage or safe multi-tab saving is unavailable.';
      }
      this.value = draft;
      this.message = message;
      for (const listener of this.listeners) listener();
      return { saved, conflict: false, message };
    };
    const job = this.pending.then(async () => {
      if (!this.exclusive) {
        result = perform();
        return;
      }
      let entered = false;
      try {
        result = await this.exclusive(() => {
          entered = true;
          return perform();
        });
      } catch (error) {
        if (entered) throw error;
        this.exclusive = null;
        result = perform();
      }
    });
    this.pending = job.catch(() => {});
    return job.then(() => result);
  }
}
export const personal = new PersonalStorage();
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === PERSONAL_KEY || event.key === null) personal.refresh();
  });
export function savePreferences(patch: Preferences): Promise<SaveResult> {
  return personal.update((draft) => {
    Object.assign(draft.preferences, patch);
  });
}
