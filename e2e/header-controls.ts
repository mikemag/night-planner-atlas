import type { Page } from '@playwright/test';

export async function openAppMenu(page: Page): Promise<void> {
  if (!(await page.locator('#appMenu').evaluate((el) => el.matches(':popover-open'))))
    await page.getByRole('button', { name: 'More options', exact: true }).click();
}

export async function chooseTheme(page: Page, theme: string): Promise<void> {
  await openAppMenu(page);
  if ((await page.locator('#themeBtn').getAttribute('aria-expanded')) !== 'true')
    await page.locator('#themeBtn').click();
  await page
    .getByRole('menuitemradio', {
      name: theme.charAt(0).toUpperCase() + theme.slice(1),
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'More options', exact: true }).click();
}

export async function openGuide(page: Page): Promise<void> {
  await openAppMenu(page);
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
}

export async function openShare(page: Page): Promise<void> {
  await openAppMenu(page);
  await page.getByRole('button', { name: 'Share plan…', exact: true }).click();
}
