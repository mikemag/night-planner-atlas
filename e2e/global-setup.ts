import { chromium, webkit, expect, type FullConfig } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Prepare disposable cache data using this run's production build, never a saved fixture. */
export default async function setup(config: FullConfig) {
  if (process.env.NPA_E2E_SUITE === 'integration') return;
  const directory = await mkdtemp(join(tmpdir(), 'npa-ui-cache-'));
  try {
    // Preserve each JavaScript engine's last-bit floating-point results as well.
    for (const [name, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ] as const) {
      const browser = await engine.launch();
      try {
        const context = await browser.newContext();
        const page = await context.newPage();
        // Cover the fixed September/October/November UI cases and unfixed "today" cases.
        // Overlapping months are calculated only once by the real application cache.
        for (const now of [
          '2026-09-24T03:00:00Z',
          '2026-11-10T02:30:00Z',
          new Date().toISOString(),
        ]) {
          await page.clock.setFixedTime(new Date(now));
          await page.goto(config.projects[0].use.baseURL!);
          await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
          await expect
            .poll(() =>
              page.evaluate(async () => {
                const db = await new Promise<IDBDatabase>((resolve, reject) => {
                  const q = indexedDB.open('npa:computed', 1);
                  q.onsuccess = () => resolve(q.result);
                  q.onerror = () => reject(q.error);
                });
                try {
                  return await new Promise<boolean>((resolve, reject) => {
                    const q = db.transaction('months').objectStore('months').getAll();
                    q.onsuccess = () => {
                      const stored = new Set<number>(
                        q.result.flatMap((m) => m.nights.map((n: { noon: number }) => n.noon)),
                      );
                      resolve(window.__npa!.nights.every((n) => stored.has(n.noon)));
                    };
                    q.onerror = () => reject(q.error);
                  });
                } finally {
                  db.close();
                }
              }),
            )
            .toBe(true);
        }
        const state = await context.storageState({ indexedDB: true });
        // Share only disposable astronomy data for the public default site. Preferences,
        // saved sites, cookies and service-worker caches must remain fresh for each test.
        const clean = {
          cookies: [],
          origins: state.origins.map((origin) => ({ ...origin, localStorage: [] })),
        };
        await writeFile(join(directory, `${name}.json`), JSON.stringify(clean));
      } finally {
        await browser.close();
      }
    }
    process.env.NPA_UI_CACHE = directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return () => rm(directory, { recursive: true, force: true });
}
