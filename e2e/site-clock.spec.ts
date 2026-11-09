import { expect, test } from '@playwright/test';
import { DEFAULT_SITES } from '../src/app/default-sites';
import { nextSolarPhase } from '../src/model/site-clock';

test.use({ timezoneId: 'Pacific/Auckland' });

test('site clock follows now in the site zone independently of chart selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-10-28T23:59:00Z') });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteClockTime')).toHaveText('Oct 28, 4:59 PM PDT (UTC−07:00)');
  await expect(page.locator('#siteClockZone')).toHaveText(' · America/Los_Angeles');
  await expect(page.locator('#siteClockCountdown')).toHaveText(/\d+min to civil twilight/);
  const countdown = await page.locator('#siteClockCountdown').textContent();
  await page.evaluate(() => window.__npa!.select(0, true));
  await expect(page.locator('#siteClock')).toContainText('Oct 28, 4:59 PM');
  const height = await page
    .locator('#siteClock')
    .evaluate((el) => el.getBoundingClientRect().height);
  await page.clock.fastForward(60_000);
  await expect(page.locator('#siteClock')).toContainText('Oct 28, 5:00 PM');
  await expect(page.locator('#siteClockCountdown')).not.toHaveText(countdown!);
  expect(await page.locator('#siteClock').evaluate((el) => el.getBoundingClientRect().height)).toBe(
    height,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

for (const width of [1512, 390]) {
  test(`countdown advances at twilight without reloading or moving the chart at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    const next = nextSolarPhase(DEFAULT_SITES[0], Date.parse('2026-10-29T01:50:00Z'))!;
    expect(next.event).toBe('nauticalDusk');
    await page.clock.install({ time: new Date(next.at - 14 * 60_000) });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteClockCountdown')).toHaveText('14min to astronomical twilight');
    await page.locator('#rangeNext').click();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteClockCountdown')).toHaveText('14min to astronomical twilight');
    const selection = await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id);
    const headerHeight = await page
      .locator('.topbar')
      .evaluate((el) => el.getBoundingClientRect().height);
    await page.clock.fastForward(13 * 60_000 + 30_000);
    await expect(page.locator('#siteClockCountdown')).toHaveText('<1min to astronomical twilight');
    await page.clock.fastForward(30_000);
    await expect(page.locator('#siteClockCountdown')).toHaveText(/min to astronomical darkness$/);
    expect(await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height)).toBe(
      headerHeight,
    );
    await page.clock.fastForward(12 * 60 * 60_000);
    await expect(page.locator('#siteClockCountdown')).toHaveText(/to civil twilight$/);
    expect(await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id)).toBe(selection);
    expect(await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height)).toBe(
      headerHeight,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('countdown catches up on return, changes with the site and survives midnight offline', async ({
  page,
  context,
}) => {
  await page.clock.install({ time: new Date('2026-10-28T23:59:00Z') });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await context.setOffline(true);
  await page.clock.setSystemTime(new Date('2026-10-29T10:30:00Z'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#siteClockTime')).toContainText('Oct 29, 3:30 AM');
  await expect(page.locator('#siteClockCountdown')).toHaveText(/to astronomical twilight$/);
  await page.locator('#siteSel').selectOption('site:sydney-linden-observatory');
  await expect(page.locator('#siteClockTime')).toContainText('Oct 29, 9:30 PM');
  await expect(page.locator('#siteClockCountdown')).toHaveText(/to astronomical twilight$/);
  const sydney = await page.locator('#siteClockCountdown').textContent();
  await page.clock.fastForward(3 * 60 * 60_000);
  await expect(page.locator('#siteClockTime')).toContainText('Oct 30, 12:30 AM');
  await expect(page.locator('#siteClockCountdown')).not.toHaveText(sydney!);
  await expect(page.locator('#siteClockCountdown')).toHaveText(/to astronomical twilight$/);
});
