import { openCurrentSiteEditor, openSites, editSite } from './site-controls';
import { chooseTheme, chooseFocus, openAppMenu } from './header-controls';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freshPersonalData } from '../src/app/personal-data';
import { readPersonal, seedPersonal } from './storage';

async function openData(page: Page) {
  await openAppMenu(page);
  await page.getByRole('menuitem', { name: 'Browser data…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Browser data', exact: true })).toBeVisible();
}
for (const width of [1512, 390])
  test(`backup controls live in Browser data and return to More at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    const before = await readPersonal(page);
    await openSites(page);
    await expect(
      page.locator('#sitePop').getByRole('button', { name: /import|export/i }),
    ).toHaveCount(0);
    await expect(page.locator('#siteStorage')).toContainText('More → Browser data');
    await page.locator('#siteDone').click();
    await openData(page);
    await expect(page.locator('#sitePop')).toBeHidden();
    await expect(page.locator('.modal.show')).toHaveCount(1);
    await expect(page.locator('.modal-backdrop')).toHaveCount(1);
    await expect(page.locator('#dataExport')).toBeVisible();
    await expect(page.locator('#dataImport')).toBeVisible();
    await page.locator('#browserDataDone').click();
    await expect(page.locator('#moreBtn')).toBeFocused();
    await expect(page.locator('#sitePop')).toBeHidden();
    await expect(page.locator('.modal.show')).toHaveCount(0);
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    expect(await readPersonal(page)).toEqual(before);
  });

for (const width of [1512, 390])
  test(`personal data exports, imports, resets and restores independently at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await chooseFocus(page, 7);
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
    await expect(page.locator('#moreBtn')).toBeFocused();
    await expect(page.locator('#sitePop')).toBeHidden();
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
  await openCurrentSiteEditor(page);
  await page.locator('#siteName').fill('First tab draft');
  await openSites(other);
  await editSite(other, 'edinburgh-royal-observatory');
  await other.locator('#siteName').fill('Other Edinburgh');
  await other.locator('#siteApply').click();
  await expect(other.locator('#sitePop')).toBeHidden();
  await page.locator('#siteApply').click();
  await expect(page.locator('#sitePop')).toBeHidden();
  let sites = (await readPersonal(page)).sites;
  expect(sites[0].name).toBe('First tab draft');
  expect(sites[1].name).toBe('Other Edinburgh');
  await openCurrentSiteEditor(page);
  await page.locator('#siteName').fill('Keep this draft');
  await openSites(other);
  await editSite(other, 'seattle-paramount-park');
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
  await chooseTheme(page, 'dark');
  await expect(page.locator('#siteStorageNotice')).toContainText('left unchanged');
  expect(await page.evaluate(() => localStorage.getItem('npa:personal'))).toBe(raw);
});

test('reordering makes an import preview stale without creating recovery history', async ({
  page,
  context,
}) => {
  await seedPersonal(page);
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const other = await context.newPage();
  await other.goto('./');
  await expect(other.locator('#loading')).toBeHidden();
  await openData(page);
  await expect(page.locator('#dataBackup')).toBeDisabled();
  await expect(page.locator('#dataRecoveryStatus')).toHaveText('No recovery copy exists yet.');
  const imported = freshPersonalData();
  imported.sites.reverse();
  await page.locator('#dataFile').setInputFiles({
    name: 'reordered.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.locator('#dataImportSummary')).toContainText('in the file’s order');
  await openSites(other);
  await other.locator('[data-site-id="edinburgh-royal-observatory"] [data-action="up"]').click();
  await expect
    .poll(async () => (await readPersonal(other)).sites[0].id)
    .toBe('edinburgh-royal-observatory');
  const latest = await readPersonal(other);
  await page.locator('#dataConfirmImport').click();
  await expect(page.locator('#browserDataStatus')).toContainText('changed in another tab');
  expect(await readPersonal(page)).toEqual(latest);
  await expect(page.locator('#dataBackup')).toBeDisabled();
  await page.locator('#dataFile').setInputFiles({
    name: 'review-again.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page.locator('#dataConfirmImport').click();
  await expect(page.locator('#dataReview')).toBeHidden();
  expect((await readPersonal(page)).sites).toEqual(imported.sites);
  await expect(page.locator('#dataBackup')).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.locator('#dataBackup').click();
  expect(JSON.parse(await readFile((await (await download).path())!, 'utf8'))).toEqual(latest);
  await page.locator('#browserDataDone').click();
  await expect(page.locator('#moreBtn')).toBeFocused();
  await expect(page.locator('#sitePop')).toBeHidden();
  await other.close();
});

test('import in another tab preserves a site draft and detects replacement of its record', async ({
  page,
  context,
}) => {
  await seedPersonal(page);
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const other = await context.newPage();
  await other.goto('./');
  await expect(other.locator('#loading')).toBeHidden();
  await openCurrentSiteEditor(page);
  await page.locator('#siteName').fill('Preserve my draft');
  await openData(other);
  const replacement = freshPersonalData();
  replacement.sites[0].name = 'Name from import';
  replacement.sites.reverse();
  await other.locator('#dataFile').setInputFiles({
    name: 'replacement.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(replacement)),
  });
  await other.locator('#dataConfirmImport').click();
  await expect(other.locator('#dataReview')).toBeHidden();
  await expect(page.locator('#siteName')).toHaveValue('Preserve my draft');
  await expect(page.locator('#siteDraftConflict')).toBeVisible();
  await page.locator('#siteSave').click();
  await expect(page.locator('#siteName')).toHaveValue('Preserve my draft');
  expect((await readPersonal(page)).sites).toEqual(replacement.sites);
  await other.close();
});
