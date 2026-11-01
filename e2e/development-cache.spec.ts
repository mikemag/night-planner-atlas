import { expect, test, type Page } from '@playwright/test';
import { appendFile, cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';

async function cacheEntries(page: Page): Promise<{ months: number; generations: string[] }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open('npa:computed', 1);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const q = db.transaction('usage').objectStore('usage').getAllKeys();
        q.onsuccess = () =>
          resolve({
            months: q.result.length,
            generations: [...new Set(q.result.map((key) => JSON.parse(String(key))[0] as string))],
          });
        q.onerror = () => reject(q.error);
      });
    } finally {
      db.close();
    }
  });
}

test('development caches sites across refreshes and safely invalidates model and codec edits', async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Exercise real file watching/HMR in an isolated copy, never editing a developer's checkout.
  const fixture = await realpath(await mkdtemp(join(tmpdir(), 'npa-dev-cache-')));
  let server: ViteDevServer | undefined;
  try {
    for (const path of [
      'src',
      'public',
      'index.html',
      'package.json',
      'package-lock.json',
      'vite.config.ts',
    ])
      await cp(resolve(path), join(fixture, path), { recursive: true });
    await symlink(resolve('node_modules'), join(fixture, 'node_modules'), 'dir');
    // Keep optimizer output in the disposable fixture, rather than through the dependency symlink.
    await mkdir(join(fixture, '.vite'), { recursive: true });
    server = await createServer({
      root: fixture,
      configFile: join(fixture, 'vite.config.ts'),
      cacheDir: join(fixture, '.vite'),
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0, fs: { allow: [fixture, process.cwd()] } },
    });
    await server.listen();
    await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
    await page.goto(server.resolvedUrls!.local[0]);
    await expect(page.locator('#loading')).toBeHidden();
    expect(await page.evaluate(() => window.__npa!.computation!.computedNights)).toBe(426);
    await expect.poll(async () => (await cacheEntries(page)).months).toBe(14);
    const originalGeneration = (await cacheEntries(page)).generations[0];
    await page.locator('#focusSeg button[data-val="7"]').click();
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('npa:personal') ?? 'null')?.preferences.focus,
        ),
      )
      .toBe(7);
    await page.locator('#siteSel').selectOption('site:edinburgh-royal-observatory');
    await expect(page.locator('#loading')).toBeHidden();
    await expect.poll(async () => (await cacheEntries(page)).months).toBe(28);
    await page.locator('#siteSel').selectOption('site:seattle-paramount-park');
    await expect(page.locator('#loading')).toBeHidden();
    expect(await page.evaluate(() => window.__npa!.computation!.computedNights)).toBe(0);
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    expect(await page.evaluate(() => window.__npa!.computation!.computedNights)).toBe(0);
    const saved = await page.evaluate(() => localStorage.getItem('npa:personal'));

    async function edit(path: string) {
      const reloaded = page.waitForEvent('domcontentloaded');
      await appendFile(join(fixture, path), '\n// Dev cache regression fixture edit.\n');
      await reloaded;
      await expect(page.locator('#loading')).toBeHidden();
      expect(await page.evaluate(() => localStorage.getItem('npa:personal'))).toBe(saved);
    }
    await edit('src/ui/controls.ts');
    expect(await page.evaluate(() => window.__npa!.computation!.computedNights)).toBe(0);
    expect((await cacheEntries(page)).generations).toEqual([originalGeneration]);

    await edit('src/model/night.ts');
    expect(await page.evaluate(() => window.__npa!.computation!.computedNights)).toBe(426);
    await expect.poll(async () => (await cacheEntries(page)).generations.length).toBe(2);
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    expect(await page.evaluate(() => window.__npa!.computation!.computedNights)).toBe(0);

    await edit('src/app/night-cache-format.ts');
    expect(await page.evaluate(() => window.__npa!.computation!.computedNights)).toBe(426);
    await expect.poll(async () => (await cacheEntries(page)).generations.length).toBe(3);
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    expect(await page.evaluate(() => window.__npa!.computation!.computedNights)).toBe(0);
    // Test-only model edits are outside the calculation fingerprint.
    await appendFile(join(fixture, 'src/model/night.test.ts'), '\n// Test fixture only.\n');
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    expect(await page.evaluate(() => window.__npa!.computation!.computedNights)).toBe(0);
    expect((await cacheEntries(page)).generations).toHaveLength(3);
  } finally {
    await page.goto('about:blank');
    await server?.close();
    await rm(fixture, { recursive: true, force: true });
  }
});
