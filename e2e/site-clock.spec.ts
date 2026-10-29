import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Pacific/Auckland' });

test('site clock follows now in the site zone independently of chart selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-10-28T23:59:00Z') });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteClock')).toHaveText(
    'Oct 28, 4:59 PM PDT (UTC−07:00) · America/Los_Angeles',
  );
  await page.evaluate(() => window.__npa!.select(0, true));
  await expect(page.locator('#siteClock')).toContainText('Oct 28, 4:59 PM');
  const height = await page
    .locator('#siteClock')
    .evaluate((el) => el.getBoundingClientRect().height);
  await page.clock.fastForward(60_000);
  await expect(page.locator('#siteClock')).toContainText('Oct 28, 5:00 PM');
  expect(await page.locator('#siteClock').evaluate((el) => el.getBoundingClientRect().height)).toBe(
    height,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
