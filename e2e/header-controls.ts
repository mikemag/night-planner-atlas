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

export async function openPlanning(page: Page): Promise<void> {
  const trigger = page.locator('#planSettingsBtn');
  if ((await trigger.isVisible()) && !(await page.locator('#planningDialog').isVisible()))
    await trigger.click();
}

export async function closePlanning(page: Page): Promise<void> {
  if (await page.locator('#planningDialog').isVisible()) {
    await page.locator('#planningDone').click();
    await page.locator('#planningDialog').waitFor({ state: 'hidden' });
  }
}

export async function chooseFocus(page: Page, focus: number | string): Promise<void> {
  await openPlanning(page);
  await page.locator(`#focusSeg button[data-val="${focus}"]`).click();
  await closePlanning(page);
}

export async function chooseMoon(
  page: Page,
  field: 'moonAltSel' | 'crescentSel',
  value: string,
): Promise<void> {
  await openPlanning(page);
  await page.locator(`#${field}`).selectOption(value);
  await closePlanning(page);
}

export async function shiftPlanningRange(page: Page, direction: 'Prev' | 'Next'): Promise<void> {
  await openPlanning(page);
  await page.locator(`#range${direction}`).click();
  await closePlanning(page);
}
