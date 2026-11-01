import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freshPersonalData } from '../src/app/personal-data';
import { readPersonal, seedPersonal } from './storage';

async function openData(page: Page) {
  await page.locator('#siteSel').selectOption('manage');
  await page.getByRole('button', { name: 'Browser data…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Browser data', exact: true })).toBeVisible();
}
for (const width of [1512, 390])
  test(`personal data exports, imports, resets and restores independently at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('#focusSeg button[data-val="7"]').click();
    await expect.poll(async () => (await readPersonal(page)).preferences.focus).toBe(7);
    await openData(page);
    const downloaded = page.waitForEvent('download');
    await page.locator('#dataExport').click();
    const exported = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'));
    expect(exported.sites).toHaveLength(6);
    expect(exported.preferences.focus).toBe(7);
    const imported = freshPersonalData();
    imported.sites = [
      {
        id: 'imported',
        name: 'Imported hill',
        lat: 55.95,
        lon: -3.19,
        tz: 'Europe/London',
        elevation: 456,
      },
    ];
    imported.active = { id: 'imported' };
    imported.preferences = {
      moonAlt: 15,
      theme: info.project.use.colorScheme === 'dark' ? 'dark' : 'light',
    };
    await page.locator('#dataFile').setInputFiles({
      name: 'personal.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(imported)),
    });
    await expect(page.locator('#dataReview')).toBeVisible();
    expect((await readPersonal(page)).sites).toHaveLength(6);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-browser-data-${width}.png`,
      });
    await page.locator('#dataConfirmImport').click();
    await expect(page.locator('#browserDataStatus')).toContainText('imported');
    expect((await readPersonal(page)).sites).toEqual(imported.sites);
    await page.getByText('Reset and recovery', { exact: true }).click();
    const previousDownload = page.waitForEvent('download');
    await page.locator('#dataBackup').click();
    const previous = JSON.parse(await readFile((await (await previousDownload).path())!, 'utf8'));
    expect(previous.sites).toHaveLength(6);
    expect(previous.preferences.focus).toBe(7);
    await page.locator('#dataRestoreStarters').click();
    await expect.poll(async () => (await readPersonal(page)).sites.length).toBe(7);
    await page.locator('#dataResetPreferences').click();
    await expect.poll(async () => (await readPersonal(page)).preferences).toEqual({});
    expect((await readPersonal(page)).sites).toHaveLength(7);
    await page.locator('#dataFile').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{damaged'),
    });
    await expect(page.locator('#browserDataStatus')).toContainText('left unchanged');
    expect((await readPersonal(page)).sites).toHaveLength(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator('#browserDataClose').click();
    await expect(page.locator('#browserDataOpen')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteSel')).toHaveValue('site:imported');
  });

test('tabs preserve unrelated edits and retain a conflicting site draft', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const other = await context.newPage();
  await other.goto('./');
  await expect(other.locator('#loading')).toBeHidden();
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#siteName').fill('First tab draft');
  await other.locator('#siteSel').selectOption('manage');
  await other.locator('#siteFavorite').selectOption('edinburgh-royal-observatory');
  await other.locator('#siteName').fill('Other Edinburgh');
  await other.locator('#siteApply').click();
  await expect(other.locator('#sitePop')).toBeHidden();
  await page.locator('#siteApply').click();
  await expect(page.locator('#sitePop')).toBeHidden();
  let sites = (await readPersonal(page)).sites;
  expect(sites[0].name).toBe('First tab draft');
  expect(sites[1].name).toBe('Other Edinburgh');
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#siteName').fill('Keep this draft');
  await other.locator('#siteSel').selectOption('manage');
  await other.locator('#siteFavorite').selectOption('seattle-paramount-park');
  await other.locator('#siteName').fill('Other Seattle');
  await other.locator('#siteApply').click();
  await expect(other.locator('#sitePop')).toBeHidden();
  await page.locator('#siteApply').click();
  await expect(page.locator('#siteStorage')).toContainText('changed in another tab');
  await expect(page.locator('#siteName')).toHaveValue('Keep this draft');
  await expect(page.locator('#sitePop')).toBeVisible();
  sites = (await readPersonal(page)).sites;
  expect(sites[0].name).toBe('Other Seattle');
  await other.close();
});

test('a newer stored schema is checked again before every write', async ({ page }) => {
  await seedPersonal(page);
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const raw = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('npa:personal')!);
    data.version = 99;
    const raw = JSON.stringify(data);
    localStorage.setItem('npa:personal', raw);
    return raw;
  });
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await expect(page.locator('#siteStorageNotice')).toContainText('left unchanged');
  expect(await page.evaluate(() => localStorage.getItem('npa:personal'))).toBe(raw);
});
