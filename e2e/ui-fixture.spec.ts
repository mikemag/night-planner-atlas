import { expect, test } from './ui-test';

test('prepared UI data matches a cold calculation without sharing personal storage', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const initial = await context.storageState();
  expect(initial.cookies).toEqual([]);
  expect(initial.origins.flatMap((origin) => origin.localStorage)).toEqual([]);
  const now = new Date('2026-10-28T22:00:00Z');
  await page.clock.setFixedTime(now);
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => window.__npa!.computation!.computedNights)).toBe(0);
  expect(await page.evaluate(() => window.__npa!.computation!.cachedNights)).toBe(426);
  const summary = () =>
    JSON.parse(JSON.stringify(window.__npa!.nights, (key, value) => (key === 'tz' ? null : value)));
  const warm = await page.evaluate(summary);
  // Playwright applies this test's context defaults to browser.newContext as well.
  const cold = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const fresh = await cold.newPage();
    await fresh.clock.setFixedTime(now);
    await fresh.goto(baseURL!);
    await expect(fresh.locator('#loading')).toBeHidden();
    expect(await fresh.evaluate(() => window.__npa!.computation!.computedNights)).toBe(426);
    expect(await fresh.evaluate(summary)).toEqual(warm);
    await page.evaluate(() => localStorage.setItem('npa:test-isolation', 'warm only'));
    expect(await fresh.evaluate(() => localStorage.getItem('npa:test-isolation'))).toBeNull();
  } finally {
    await cold.close();
  }
});
