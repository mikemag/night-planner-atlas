import { chooseFocus, chooseMoon, shiftPlanningRange } from './header-controls';
import { expect, test, type Page } from '@playwright/test';
import { seedPersonal, readPersonal } from './storage';

async function open(page: Page, now = '2026-10-28T22:00:00Z') {
  await page.clock.setFixedTime(new Date(now));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open('npa:computed', 1);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    try {
      return await new Promise<Array<{ key: string; bytes: number; usedAt: number }>>(
        (resolve, reject) => {
          const tx = db.transaction('usage');
          const q = tx.objectStore('usage').getAll();
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
        },
      );
    } finally {
      db.close();
    }
  });
}
async function stats(page: Page) {
  return page.evaluate(() => window.__npa!.computation!);
}
async function cached(page: Page, count: number) {
  await expect.poll(async () => (await records(page)).length).toBe(count);
}
async function summary(page: Page) {
  return page.evaluate(() =>
    window.__npa!.nights.map((n) => ({
      id: n.id,
      events: n.ev,
      below: n.sunBelow,
      mf: n.mf,
      tdMs: n.tdMs,
      mfMs: n.mfMs,
      illum: n.illum,
      phase: n.phase,
      alt: Array.from(n.moonAlt),
    })),
  );
}

test('reloads and planning variations reuse calculations, preserving all numerical results', async ({
  page,
}) => {
  await open(page);
  expect((await stats(page)).computedNights).toBe(426);
  await cached(page, 14);
  const cold = await summary(page);
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).computedNights).toBe(0);
  expect(await summary(page)).toEqual(cold);
  await chooseMoon(page, 'moonAltSel', '15');
  await chooseMoon(page, 'crescentSel', '0.3');
  await chooseFocus(page, 3);
  await expect.poll(async () => (await readPersonal(page)).preferences.crescent).toBe(0.3);
  const changed = await summary(page);
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).computedNights).toBe(0);
  expect(await summary(page)).toEqual(changed);
  await cached(page, 14);
});
test('multiple sites and a rolling month reuse independent monthly blocks', async ({ page }) => {
  await open(page);
  await cached(page, 14);
  await page.locator('#siteSel').selectOption('site:svalbard-kjell-henriksen-observatory');
  await expect(page.locator('#loading')).toBeHidden();
  await cached(page, 28);
  expect((await stats(page)).computedNights).toBe(426);
  const polar = await summary(page);
  await page.locator('#siteSel').selectOption('site:seattle-paramount-park');
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).computedNights).toBe(0);
  await page.locator('#siteSel').selectOption('site:svalbard-kjell-henriksen-observatory');
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).computedNights).toBe(0);
  expect(await summary(page)).toEqual(polar);
  await page.clock.setFixedTime(new Date('2026-11-15T22:00:00Z'));
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).computedNights).toBe(30);
  expect((await stats(page)).cachedNights).toBe(396);
  await cached(page, 29);
});
test('corrupt entries and old compute/format generations are recomputed', async ({ page }) => {
  await open(page);
  await cached(page, 14);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const q = indexedDB.open('npa:computed', 1);
      q.onsuccess = () => resolve(q.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['months', 'usage'], 'readwrite');
      const store = tx.objectStore('months'),
        q = store.getAll();
      q.onsuccess = () => {
        for (const [i, row] of q.result.entries()) {
          if (i === 0) {
            row.nights[0].moonAlt[0] = NaN;
            store.put(row);
          } else {
            const original = row.key;
            const parts = JSON.parse(row.key);
            parts[0] = 'old-engine-and-format';
            row.key = JSON.stringify(parts);
            store.delete(original);
            store.put(row);
            tx.objectStore('usage').delete(original);
            tx.objectStore('usage').put({ key: row.key, bytes: row.bytes, usedAt: 0 });
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).cachedNights).toBe(0);
  expect((await stats(page)).computedNights).toBe(426);
});
test('cache failures and temporary shared sites keep working without persistent private calculations', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new Error('Unavailable');
      },
    }),
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  expect((await stats(page)).computedNights).toBe(426);
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).computedNights).toBe(426);
  expect(errors).toEqual([]);
});
test('temporary included sites are not written into the persistent cache', async ({ page }) => {
  const site = { name: 'Temporary site', lat: 10, lon: 20, tz: 'UTC' };
  const plan = {
    v: 1,
    view: 'river',
    riverZoom: 'month',
    calZoom: 'month',
    calOrient: 'v',
    focus: 0,
    moonAlt: 0,
    crescent: 0,
    start: '2026-09',
    night: null,
    expanded: false,
    site,
  };
  await page.goto('./#npa=' + encodeURIComponent(JSON.stringify(plan)));
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).computedNights).toBeGreaterThan(400);
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#browserDataOpen').click();
  await expect(page.locator('#dataCacheSummary')).toContainText('0 cached site-months');
  expect((await readPersonal(page)).sites.some((s) => s.name === site.name)).toBe(false);
});
test('clearing only the computed cache preserves the saved personal document', async ({ page }) => {
  await seedPersonal(page, { preferences: { focus: 7, theme: 'observing' } });
  await open(page);
  await cached(page, 14);
  const before = await page.evaluate(() => localStorage.getItem('npa:personal'));
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#browserDataOpen').click();
  await page.locator('#dataClearCache').click();
  await expect(page.locator('#browserDataStatus')).toContainText('cache cleared');
  await cached(page, 0);
  expect(await page.evaluate(() => localStorage.getItem('npa:personal'))).toBe(before);
});
test('rapid site changes publish only the latest site even with pending cache reads', async ({
  page,
}) => {
  await open(page);
  await cached(page, 14);
  await page.locator('#siteSel').selectOption('site:chile-rubin-observatory');
  await page.locator('#siteSel').selectOption('site:seattle-paramount-park');
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).computedNights).toBe(0);
  expect(await page.evaluate(() => window.__npa!.S.site.name)).toBe('Seattle, Paramount Park');
  const noon = await page.evaluate(() => window.__npa!.nights[0].noon);
  expect(new Date(noon).getUTCHours()).toBe(19);
});

test('renaming reuses a calculation while elevation and zone variations keep separate entries', async ({
  page,
}) => {
  await open(page);
  await cached(page, 14);
  async function edit(field: string, value: string) {
    await page.locator('#siteSel').selectOption('manage');
    await page.locator(field).fill(value);
    await page.locator('#siteApply').click();
    await expect(page.locator('#sitePop')).toBeHidden();
    await expect(page.locator('#loading')).toBeHidden();
  }
  await edit('#siteName', 'My park');
  expect((await stats(page)).computedNights).toBe(0);
  await edit('#siteElevation', '123');
  expect((await stats(page)).computedNights).toBe(426);
  await cached(page, 28);
  await edit('#siteElevation', '122');
  expect((await stats(page)).computedNights).toBe(0);
  await edit('#siteTz', 'America/Vancouver');
  expect((await stats(page)).computedNights).toBe(426);
  await cached(page, 42);
  await edit('#siteTz', 'America/Los_Angeles');
  expect((await stats(page)).computedNights).toBe(0);
});
test('least recently used months are evicted within the byte and entry limits', async ({
  page,
}) => {
  await open(page);
  await cached(page, 14);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const q = indexedDB.open('npa:computed', 1);
      q.onsuccess = () => resolve(q.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['months', 'usage'], 'readwrite');
      for (let i = 0; i < 512; i++) {
        const key = `unused:${String(i).padStart(3, '0')}`;
        tx.objectStore('months').put({ key, nights: [], bytes: 100000 });
        tx.objectStore('usage').put({ key, bytes: 100000, usedAt: i });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.locator('#siteSel').selectOption('site:edinburgh-royal-observatory');
  await expect(page.locator('#loading')).toBeHidden();
  await expect
    .poll(async () => (await records(page)).reduce((sum, r) => sum + r.bytes, 0))
    .toBeLessThanOrEqual(32 * 1024 * 1024);
  const entries = await records(page);
  expect(entries.length).toBeLessThanOrEqual(512);
  expect(entries.some((e) => e.key === 'unused:000')).toBe(false);
  expect(entries.some((e) => e.key === 'unused:511')).toBe(true);
  await page.locator('#siteSel').selectOption('site:seattle-paramount-park');
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).computedNights).toBe(0);
});
test('quota failures retry once and leave saved data and interaction intact', async ({ page }) => {
  await seedPersonal(page, { preferences: { focus: 7 } });
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'months') {
        document.documentElement.dataset.cacheWriteAttempts = String(
          Number(document.documentElement.dataset.cacheWriteAttempts ?? 0) + 1,
        );
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator('html')).toHaveAttribute('data-cache-write-attempts', '2');
  expect((await readPersonal(page)).preferences.focus).toBe(7);
  expect(errors).toEqual([]);
  await page.locator('#siteSel').selectOption('site:edinburgh-royal-observatory');
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).computedNights).toBe(426);
  expect(errors).toEqual([]);
});

test('year navigation reuses overlapping months and leap-year results', async ({ page }) => {
  await open(page);
  await cached(page, 14);
  await shiftPlanningRange(page, 'Next');
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).cachedNights).toBe(61);
  expect((await stats(page)).computedNights).toBe(366);
  expect(await page.evaluate(() => window.__npa!.nights.some((n) => n.id === '2028-02-29'))).toBe(
    true,
  );
  await cached(page, 26);
  await shiftPlanningRange(page, 'Prev');
  await expect(page.locator('#loading')).toBeHidden();
  expect((await stats(page)).computedNights).toBe(0);
});
test('clearing during computation prevents a late cache write from repopulating it', async ({
  page,
}) => {
  await open(page);
  await cached(page, 14);
  await shiftPlanningRange(page, 'Next');
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#browserDataOpen').click();
  await page.locator('#dataClearCache').click();
  await expect(page.locator('#browserDataStatus')).toContainText('cache cleared');
  await expect(page.locator('#loading')).toBeHidden();
  // The completion callback runs before this read; cache writes, if any, use the same task queue.
  await cached(page, 0);
});
