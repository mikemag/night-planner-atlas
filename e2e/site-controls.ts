import { expect, type Page } from '@playwright/test';

export async function openSites(page: Page): Promise<void> {
  if (!(await page.locator('#sitePop').isVisible()))
    await page.locator('#siteSel').selectOption('manage');
  await expect(page.locator('#siteList')).toBeVisible();
}

export async function editSite(page: Page, id: string): Promise<void> {
  await page.locator(`[data-site-id="${id}"] [data-action="edit"]`).click();
  await expect(page.locator('#siteForm')).toBeVisible();
}

export async function openCurrentSiteEditor(page: Page): Promise<void> {
  const value = await page.locator('#siteSel').inputValue();
  await openSites(page);
  if (value.startsWith('site:')) await editSite(page, value.slice(5));
  else await page.locator('#siteSaveCurrent').click();
}

export async function siteAction(
  page: Page,
  id: string,
  action: 'duplicate' | 'remove',
): Promise<void> {
  await page.locator(`[data-site-id="${id}"] [data-action="${action}"]`).click();
}

export async function discardSiteDraft(page: Page): Promise<void> {
  await page.locator('#siteCancel').click();
  if (await page.locator('#siteDiscard').isVisible())
    await page.locator('#siteDiscardChanges').click();
  await expect(page.locator('#siteForm')).toBeHidden();
}
