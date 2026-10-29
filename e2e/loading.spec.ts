import { expect, test } from '@playwright/test';

test('controls changed during loading apply to the completed range', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__npa);
  await expect(page.locator('#loading')).toBeVisible();
  await page.locator('#moonAltSel').selectOption('15');
  await page.locator('#crescentSel').selectOption('0.3');
  await page.locator('#focusSeg button[data-val="3"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(() => {
    const app = window.__npa!;
    return {
      moonAlt: app.S.moonAlt,
      crescent: app.S.crescent,
      ignored: app.nights
        .filter((night) => night.illum < 0.3)
        .every((night) => night.moonIgnored && night.mfMs === night.tdMs),
      totals: app.lunations.every((cycle) => {
        const expected = app.nights
          .slice(Math.max(0, cycle.i - 3), Math.max(0, cycle.i + 4))
          .reduce((sum, night) => sum + night.mfMs, 0);
        return Math.abs(cycle.total - expected) < 1;
      }),
    };
  });
  expect(result).toEqual({ moonAlt: 15, crescent: 0.3, ignored: true, totals: true });
});
