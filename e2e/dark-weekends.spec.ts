import { expect, test } from '@playwright/test';
import { chooseTheme } from './header-controls';
import { readPreference } from './storage';

for (const width of [1512, 390]) {
  test(`Dark Weekends compares trip lengths and opens nights at ${width}px @retina`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.clock.setFixedTime(new Date('2026-11-05T20:30:00Z'));
    await page.goto(
      './#npa=1&view=weekends&start=2026-10&crescent=20&riverZoom=year&calZoom=year&focus=3',
    );
    await page.locator('#siteSel').selectOption('site:sydney-linden-observatory');
    await expect(page.locator('#loading')).toBeHidden();
    const panel = page.locator('#darkWeekends');
    await expect(panel).toBeVisible();
    await expect(page.locator('#focusCtl')).toBeHidden();
    await expect(page.locator('#scroller')).toBeHidden();
    await expect(panel.getByLabel('New moons', { exact: true })).toHaveCount(0);
    await expect(panel.getByRole('article')).toHaveCount(15);
    await expect(panel.getByRole('article').first()).toHaveAccessibleName('Oct 11, 2026');
    const last = panel.getByRole('article').last();
    await expect(last).toHaveAccessibleName('Nov 28, 2027');
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    const december = panel.getByRole('article', { name: 'Dec 9, 2026' });
    const [weekend, extended] = await december.locator('.trip-pick').all();
    await expect(weekend).toContainText('Dec 4–5');
    await expect(weekend).toContainText('12h 40m');
    await expect(extended).toContainText('Dec 10–13');
    await expect(extended).toContainText('24h 50m');
    await expect(december).toContainText('Different weekend');

    await december.getByText('Compare 4 weekends', { exact: true }).click();
    const sameWeekend = december.locator('.trip-candidate').filter({ hasText: 'Dec 4–5' });
    await expect(sameWeekend.locator('summary')).toContainText('+11h 2m');
    await sameWeekend.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(sameWeekend.getByRole('listitem')).toHaveCount(4);
    await expect(sameWeekend.getByRole('listitem').last()).toContainText('Sun Dec 6');

    for (const [source, name, view, date, detail] of [
      [weekend, 'Open Dec 4–5 in River', 'River', '2026-12-04', 'riverDetail'],
      [sameWeekend, 'Open Dec 3–6 in Lunations', 'Lunations', '2026-12-03', 'lunationsDetail'],
      [extended, 'Open Dec 10–13 in Calendar', 'Calendar', '2026-12-10', 'calendarDetail'],
    ] as const) {
      await source.getByRole('button', { name, exact: true }).click();
      await expect(page.locator('#viewTitle')).toHaveText(view);
      expect(await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id)).toBe(date);
      await expect(page.locator(`#${detail}`)).toBeVisible();
      await expect(page.locator('#cv')).toBeFocused();
      if (view === 'Lunations')
        await expect(page.locator('#lunationsDetail')).toContainText(
          'Night outside displayed window',
        );
      await page.getByRole('button', { name: 'Dark Weekends', exact: true }).click();
      await expect(sameWeekend.getByRole('listitem')).toHaveCount(4);
    }

    const settings = page.locator('#moonSettingsSummary');
    if (await settings.isVisible()) await settings.click();
    await page.locator('#crescentSel').selectOption('0');
    await expect(december).toContainText('Same weekend');
    await expect(sameWeekend.getByRole('listitem')).toHaveCount(4);
    for (const theme of ['light', 'dark', 'observing']) {
      await chooseTheme(page, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      expect(
        await panel.locator('#tripScroll').evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBe(0);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-dark-weekends-${width}-${theme}.png`,
        });
    }
    await page.getByRole('link', { name: 'Docs', exact: true }).click();
    await page.getByRole('link', { name: 'Back to planner' }).click();
    await expect(sameWeekend.getByRole('listitem')).toHaveCount(4);
  });
}

test('Dark Weekends is saved as a view and Tonight restores a past range', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T20:30:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Dark Weekends', exact: true }).click();
  await expect.poll(() => readPreference(page, 'view')).toBe('weekends');
  await page.reload();
  await expect(page.locator('#darkWeekends')).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#rangePrev').click();
  await page.locator('#rangePrev').click();
  const cycles = page.locator('#darkWeekends').getByRole('article');
  await expect(cycles.first()).toHaveAccessibleName('Oct 2, 2024');
  await expect(cycles.last()).toHaveAccessibleName('Nov 19, 2025');
  await page.getByRole('button', { name: 'Tonight', exact: true }).click();
  await expect(cycles.first()).toHaveAccessibleName('Oct 10, 2026');
  await expect(cycles.nth(1).getByRole('heading', { name: 'Nov 8, 2026' })).toBeInViewport();
});
