import { test as base, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
const prepared = new Map<string, StorageState>();

/** Each test still gets its own context, storage, page, and mutable calculation objects. */
export const test = base.extend({
  storageState: async ({ baseURL, browserName }, use) => {
    const directory = process.env.NPA_UI_CACHE;
    if (!directory) throw new Error('UI cache was not prepared by the Playwright global setup.');
    let state = prepared.get(browserName);
    if (!state) {
      state = JSON.parse(
        readFileSync(join(directory, `${browserName}.json`), 'utf8'),
      ) as StorageState;
      prepared.set(browserName, state);
    }
    if (!state.origins.some((origin) => origin.origin === new URL(baseURL!).origin))
      throw new Error('Prepared UI cache does not belong to this preview server.');
    await use(state);
  },
});

// Use coldTest for loading or computation-count assertions within an otherwise visual file.
export { expect, test as coldTest, type Page } from '@playwright/test';
