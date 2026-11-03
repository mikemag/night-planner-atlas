import type { Page } from '@playwright/test';

export async function openAppMenu(page: Page): Promise<void> {
  if ((await page.locator('#moreBtn').getAttribute('aria-expanded')) !== 'true')
    await page.getByRole('button', { name: 'More options', exact: true }).click();
}

export async function chooseTheme(page: Page, theme: string): Promise<void> {
  await openAppMenu(page);
  await page
    .getByRole('menuitemradio', {
      name: theme.charAt(0).toUpperCase() + theme.slice(1),
      exact: true,
    })
    .click();
  await page.locator('#appMenu').waitFor({ state: 'hidden' });
}

export async function openGuide(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Docs', exact: true }).click();
}

export async function openShare(page: Page): Promise<void> {
  await openAppMenu(page);
  await page.getByRole('menuitem', { name: 'Share plan…', exact: true }).click();
}
