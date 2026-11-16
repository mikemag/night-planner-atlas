import { expect, test } from '@playwright/test';
import { DEFAULT_SITES } from '../src/app/default-sites';
import { openSites, editSite, siteAction, discardSiteDraft } from './site-controls';
import { chooseTheme } from './header-controls';
import { readPersonal, seedPersonal } from './storage';

const seattle = DEFAULT_SITES[0];
const edinburgh = DEFAULT_SITES[1];
const sydney = DEFAULT_SITES[2];

for (const width of [1512, 390]) {
  test(`site order saves independently of selection and survives reload at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    const initialSite = await page.evaluate(() => window.__npa!.S.site);
    await page.evaluate(() => {
      document.body.dataset.readyCount = '0';
      window.addEventListener('npa-ready', () => {
        document.body.dataset.readyCount = String(Number(document.body.dataset.readyCount) + 1);
      });
    });
    await openSites(page);
    await expect(page.locator('#siteForm')).toBeHidden();
    await expect(page.locator('#siteSel > hr')).toHaveCount(1);
    const up = page.locator(`[data-site-id="${sydney.id}"] [data-action="up"]`);
    await up.focus();
    await page.keyboard.press('Enter');
    await expect(up).toBeFocused();
    await page.keyboard.press('Space');
    await expect(up).toHaveAttribute('aria-disabled', 'true');
    await expect(up).toBeFocused();
    const ids = [
      sydney.id,
      seattle.id,
      edinburgh.id,
      ...DEFAULT_SITES.slice(3).map((site) => site.id),
    ];
    await expect
      .poll(async () => (await readPersonal(page)).sites.map((site) => site.id))
      .toEqual(ids);
    expect(
      await page
        .locator('#siteList > li')
        .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.siteId)),
    ).toEqual(ids);
    expect(
      await page
        .locator('#siteSel option')
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)),
    ).toEqual([...ids.map((id) => `site:${id}`), 'manage']);
    expect(await page.evaluate(() => window.__npa!.S.site)).toEqual(initialSite);
    expect(await page.locator('body').getAttribute('data-ready-count')).toBe('0');
    await page.locator('#siteDone').click();
    await expect(page.locator('#siteSel')).toBeFocused();
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    expect((await readPersonal(page)).sites.map((site) => site.id)).toEqual(ids);
    for (const theme of ['light', 'dark', 'observing']) {
      await chooseTheme(page, theme);
      await openSites(page);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-site-manager-${theme}-${width}.png`,
        });
      await editSite(page, sydney.id);
      await expect(page.locator('#siteName')).toHaveValue(sydney.name);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-site-editor-${theme}-${width}.png`,
        });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await discardSiteDraft(page);
      await page.locator('#siteDone').click();
    }
  });

  test(`saving and duplicating sites does not activate them at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    const initialSite = await page.evaluate(() => window.__npa!.S.site);
    await openSites(page);
    await editSite(page, edinburgh.id);
    await page.locator('#siteName').fill('Renamed observatory');
    await page.locator('#siteSave').click();
    await expect(page.locator('#siteForm')).toBeHidden();
    expect(await page.evaluate(() => window.__npa!.S.site)).toEqual(initialSite);
    expect((await readPersonal(page)).active).toEqual({ id: seattle.id });
    await siteAction(page, edinburgh.id, 'duplicate');
    await page.locator('#siteName').fill('Observatory copy');
    await page.locator('#siteSave').click();
    await expect(page.locator('#siteForm')).toBeHidden();
    expect((await readPersonal(page)).sites.map((site) => site.name).slice(0, 4)).toEqual([
      seattle.name,
      'Renamed observatory',
      'Observatory copy',
      sydney.name,
    ]);
    await page.locator('#siteAdd').click();
    await page.locator('#siteName').fill('New ridge');
    await page.locator('#siteLocation').fill('45, -120');
    await page.locator('#siteTz').fill('America/Los_Angeles');
    await page.locator('#siteSave').click();
    await expect(page.locator('#siteForm')).toBeHidden();
    expect((await readPersonal(page)).sites[0].name).toBe('New ridge');
    expect(await page.evaluate(() => window.__npa!.S.site)).toEqual(initialSite);
    await editSite(page, seattle.id);
    await page.locator('#siteName').fill('My current park');
    await page.locator('#siteSave').click();
    await expect(page.locator('#siteForm')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__npa!.S.site.name)).toBe('My current park');
    await expect(page.locator('#sitePop')).toBeVisible();
  });
}

test('cross-tab additions, removals and moves preserve a draft and unrelated records', async ({
  page,
  context,
}) => {
  await seedPersonal(page);
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const other = await context.newPage();
  await other.goto('./');
  await expect(other.locator('#loading')).toBeHidden();
  await openSites(page);
  await editSite(page, seattle.id);
  await page.locator('#siteName').fill('My draft');
  const zoneStatus = await page.locator('#siteZoneStatus').textContent();
  await openSites(other);
  await other.locator(`[data-site-id="${sydney.id}"] [data-action="up"]`).click();
  await siteAction(other, edinburgh.id, 'remove');
  await other.locator('#siteConfirmRemove').click();
  await other.locator('#siteAdd').click();
  await other.locator('#siteName').fill('Other tab addition');
  await other.locator('#siteLocation').fill('46, -121');
  await other.locator('#siteTz').fill('America/Los_Angeles');
  await other.locator('#siteSave').click();
  await expect(other.locator('#siteForm')).toBeHidden();
  await expect(page.locator('#siteList')).toContainText('Other tab addition');
  await expect(page.locator('#siteName')).toHaveValue('My draft');
  await page.locator(`[data-site-id="${sydney.id}"] [data-action="up"]`).click();
  await expect(page.locator('#siteName')).toHaveValue('My draft');
  await expect(page.locator('#siteZoneStatus')).toHaveText(zoneStatus!);
  await expect(page.locator('#siteActionStatus')).toContainText('moved to position 2');
  const order = (await readPersonal(page)).sites.map((site) => site.id);
  await page.locator('#siteSave').click();
  await expect(page.locator('#siteForm')).toBeHidden();
  const stored = await readPersonal(page);
  expect(stored.sites.map((site) => site.id)).toEqual(order);
  expect(stored.sites.find((site) => site.id === seattle.id)?.name).toBe('My draft');
  expect(stored.sites.some((site) => site.id === edinburgh.id)).toBe(false);
  expect(stored.sites.some((site) => site.name === 'Other tab addition')).toBe(true);

  await editSite(page, seattle.id);
  await page.locator('#siteName').fill('Keep after removal');
  await siteAction(other, seattle.id, 'remove');
  await other.locator('#siteConfirmRemove').click();
  await expect(page.locator('#siteDraftMessage')).toContainText('removed since you opened it');
  await page.locator('#siteSave').click();
  await expect(page.locator('#siteName')).toHaveValue('Keep after removal');
  await expect(page.locator('#siteStorage')).toContainText('changed in another tab');
  await page.locator('#siteDraftCopy').click();
  await page.locator('#siteSave').click();
  await expect(page.locator('#siteForm')).toBeHidden();
  expect((await readPersonal(page)).sites[0].name).toBe('Keep after removal');
  expect((await readPersonal(page)).sites.some((site) => site.id === seattle.id)).toBe(false);
  await other.close();
});

test('switching drafts and closing require an explicit discard while moves stay saved', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await openSites(page);
  await editSite(page, seattle.id);
  await page.locator('#siteName').fill('Do not lose this');
  await page.locator(`[data-site-id="${sydney.id}"] [data-action="up"]`).click();
  await page.locator(`[data-site-id="${edinburgh.id}"] [data-action="edit"]`).click();
  await expect(page.locator('#siteDiscard')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#siteDiscard')).toBeHidden();
  await expect(page.locator('#siteName')).toHaveValue('Do not lose this');
  await page.locator('#siteDone').click();
  await expect(page.locator('#siteDiscard')).toBeVisible();
  await page.locator('#siteDiscardChanges').click();
  await expect(page.locator('#sitePop')).toBeHidden();
  const saved = await readPersonal(page);
  expect(saved.sites[0].name).toBe(seattle.name);
  expect(saved.sites[1].id).toBe(sydney.id);
});

test('failed reorders keep the saved document and export the temporary order', async ({ page }) => {
  await seedPersonal(page);
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const saved = await readPersonal(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Unavailable');
    };
  });
  await openSites(page);
  await page.locator(`[data-site-id="${edinburgh.id}"] [data-action="up"]`).click();
  await expect(page.locator('#siteStorage')).toContainText('temporary');
  expect(await readPersonal(page)).toEqual(saved);
  const download = page.waitForEvent('download');
  await page.locator('#siteExport').click();
  const { readFile } = await import('node:fs/promises');
  const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(exported.sites[0].id).toBe(edinburgh.id);
  expect(exported.active).toEqual(saved.active);
});

test('switching after a discard prompt reads the latest target record', async ({
  page,
  context,
}) => {
  await seedPersonal(page);
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const other = await context.newPage();
  await other.goto('./');
  await expect(other.locator('#loading')).toBeHidden();
  await openSites(page);
  await editSite(page, seattle.id);
  await page.locator('#siteName').fill('Unfinished');
  await page.locator(`[data-site-id="${edinburgh.id}"] [data-action="edit"]`).click();
  await expect(page.locator('#siteDiscard')).toBeVisible();
  await openSites(other);
  await editSite(other, edinburgh.id);
  await other.locator('#siteName').fill('Latest saved name');
  await other.locator('#siteSave').click();
  await expect(other.locator('#siteForm')).toBeHidden();
  await page.locator('#siteDiscardChanges').click();
  await expect(page.locator('#siteName')).toHaveValue('Latest saved name');
  await page.locator('#siteSave').click();
  await expect(page.locator('#siteForm')).toBeHidden();
  expect((await readPersonal(page)).sites.find((site) => site.id === edinburgh.id)?.name).toBe(
    'Latest saved name',
  );
  await other.close();
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 844, height: 390 },
]) {
  test(`long site lists return to the edited row at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const sites = Array.from({ length: 24 }, (_, index) => ({
      ...DEFAULT_SITES[index % DEFAULT_SITES.length],
      id: `site-${index}`,
      name: `Observing site ${index + 1} with a long recognizable name`,
    }));
    await seedPersonal(page, { sites, active: { id: sites[0].id } });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await openSites(page);
    const edit = page.locator('[data-site-id="site-20"] [data-action="edit"]');
    await edit.click();
    await expect(page.locator('.site-library')).toBeHidden();
    await expect(page.locator('#siteName')).toHaveValue(sites[20].name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-site-editor-${viewport.width}x${viewport.height}.png`,
      });
    await page.locator('#siteCancel').click();
    await expect(edit).toBeFocused();
    await expect(edit).toBeInViewport({ ratio: 1 });
    await siteAction(page, 'site-20', 'duplicate');
    await page.locator('#siteName').fill('Long-list copy');
    await page.locator('#siteSave').click();
    await expect(page.locator('#siteForm')).toBeHidden();
    const copyEdit = page.getByRole('button', { name: 'Edit Long-list copy', exact: true });
    await expect(copyEdit).toBeFocused();
    await expect(copyEdit).toBeInViewport({ ratio: 1 });
    await page.locator('#siteDone').click();
    await expect(page.locator('#siteSel')).toBeFocused();
  });
}
