import { expect, test, type Page } from '@playwright/test';
import { closePlanning, openPlanning, openShare } from './header-controls';

const selectedNight = (page: Page) =>
  page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel]?.id);

async function chooseYear(page: Page, year: number) {
  await page.getByRole('button', { name: /^Choose range/ }).click();
  await page.getByRole('spinbutton', { name: 'Calendar year' }).fill(String(year));
  await page.getByRole('button', { name: 'Show year' }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#rangeLabel')).toHaveText(`Jan – Dec ${year}`);
}

test('the range picker shares a leap year across views and in a plan link', async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date('2027-01-01T10:00:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const picker = page.getByRole('button', { name: /^Choose range/ });
  const menu = page.locator('#rangeMenu');
  await expect(picker).toContainText('Dec 2026 – Jan 2028');
  expect(await selectedNight(page)).toBe('2026-12-31');
  await picker.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Around now/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('spinbutton', { name: 'Calendar year' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(picker).toBeFocused();

  await chooseYear(page, 2028);
  expect(await selectedNight(page)).toBe('2028-01-01');
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await expect(page.locator('#periodLabel')).toHaveText('2028');
  expect(
    await page.evaluate(() => {
      const { nights, riverRows } = window.__npa!;
      const last = nights.at(-1)!;
      return {
        first: nights[0].id,
        last: last.id,
        nextDay: last.tz.wallParts(last.nextNoon).d,
        rows: riverRows.heights.length,
        leapDay: nights.some((n) => n.id === '2028-02-29'),
      };
    }),
  ).toEqual({ first: '2028-01-01', last: '2028-12-31', nextDay: 1, rows: 366, leapDay: true });
  if (process.env.SCREENSHOTS) {
    await picker.click();
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-range-picker.png`,
    });
    await page.keyboard.press('Escape');
  }

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  const months = page.locator('[data-calendar-month]');
  await expect(months).toHaveCount(12);
  const columns = () =>
    months.evaluateAll(
      (buttons) => new Set(buttons.map((b) => (b as HTMLElement).style.left)).size,
    );
  await expect.poll(columns).toBe(4);
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-calendar-year.png`,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(columns).toBe(2);
  await openPlanning(page);
  await picker.click();
  await expect(menu).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-calendar-year-phone.png`,
    });
  await page.keyboard.press('Escape');
  await closePlanning(page);
  await months.last().click();
  await expect(page.locator('#periodLabel')).toHaveText('December 2028');

  await openShare(page);
  const url = new URL(await page.locator('#shareLink').inputValue());
  const fields = new URLSearchParams(url.hash.slice(1));
  expect(fields.get('start')).toBe('2028-01');
  expect(fields.get('range')).toBe('year');
  await page.goto('about:blank');
  await page.goto(url.href);
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#planRangeLabel')).toHaveText('Jan – Dec 2028');
  expect(await selectedNight(page)).toBe('2028-12-01');
});

test('arrows preserve the mode and Tonight resets only a range that excludes it', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2027-01-01T10:00:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await chooseYear(page, 2026);
  expect(await selectedNight(page)).toBe('2026-12-31');
  await page.evaluate(() => window.__npa!.select(0, true));
  await page.getByRole('button', { name: 'Tonight', exact: true }).click();
  expect(await selectedNight(page)).toBe('2026-12-31');
  await expect(page.locator('#rangeLabel')).toHaveText('Jan – Dec 2026');
  await page.getByRole('button', { name: 'Load range one year later' }).click();
  await expect(page.locator('#rangeLabel')).toHaveText('Jan – Dec 2027');
  expect(await selectedNight(page)).toBe('2027-01-01');
  await page.getByRole('button', { name: 'Tonight', exact: true }).click();
  await expect(page.locator('#rangeLabel')).toHaveText('Dec 2026 – Jan 2028');
  expect(await selectedNight(page)).toBe('2026-12-31');
  await page.getByRole('button', { name: 'Load range one year later' }).click();
  await expect(page.locator('#rangeLabel')).toHaveText('Dec 2027 – Jan 2029');
  await page.getByRole('button', { name: /^Choose range/ }).click();
  await page.getByRole('button', { name: /^Around now/ }).click();
  await expect(page.locator('#rangeLabel')).toHaveText('Dec 2026 – Jan 2028');
});
