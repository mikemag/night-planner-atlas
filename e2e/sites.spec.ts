import { expect, test } from '@playwright/test';

for (const width of [1512, 390]) {
  test(`favorites preserve full records through drafts, copies and removal at ${width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.addInitScript(() => {
      if (!localStorage.getItem('npa:site'))
        localStorage.setItem(
          'npa:site',
          JSON.stringify({
            name: 'Legacy ridge',
            lat: 55.95,
            lon: -3.19,
            tz: 'Europe/London',
            elevation: 1234,
          }),
        );
    });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('#siteBtn').click();
    await expect(page.locator('#siteFavorite option')).toHaveCount(1);
    await page.locator('#siteName').fill('Unsaved edit');
    await page.keyboard.press('Escape');
    await expect(page.locator('#siteBtn')).toBeFocused();
    await expect(page.locator('#siteBtn')).toContainText('Legacy ridge');
    await page.locator('#siteBtn').click();
    await expect(page.locator('#siteName')).toHaveValue('Legacy ridge');
    await page.locator('#siteAdd').click();
    await page
      .locator('#siteLocation')
      .fill(
        'https://www.google.com/maps/search/?api=1&query=44.7749,-117.8344&utm_source=discard-me',
      );
    await expect(page.locator('#siteCoordinates')).toHaveText(
      'Latitude 44.7749°, longitude -117.8344°',
    );
    await expect(page.locator('#siteTz')).toHaveValue('America/Los_Angeles');
    await page
      .locator('#siteName')
      .fill('Baker ridge with a long recognizable observing site name');
    await page.locator('#siteElevation').fill('2000');
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-sites-${width}.png`,
      });
    await page.locator('#siteApply').click();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteClock')).toContainText('America/Los_Angeles');
    const stored = await page.evaluate(() => localStorage.getItem('npa:favorites')!);
    expect(stored).not.toMatch(/google|discard-me|query=/);
    expect(JSON.parse(stored).sites).toHaveLength(2);
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteBtn')).toContainText('Baker ridge');
    await page.locator('#siteBtn').click();
    await expect(page.locator('#siteElevation')).toHaveValue('2000');
    await page.locator('#siteDuplicate').click();
    await page.locator('#siteCancel').click();
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('npa:favorites')!).sites.length),
    ).toBe(2);
    await page.locator('#siteBtn').click();
    await page.locator('#siteDuplicate').click();
    await page.locator('#siteName').fill('Baker copy');
    await page.locator('#siteApply').click();
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('#siteBtn').click();
    await page.locator('#siteRemove').click();
    await page.locator('#siteKeep').click();
    await expect(page.locator('#siteFavorite option')).toHaveCount(3);
    await page.locator('#siteRemove').click();
    await page.locator('#siteConfirmRemove').click();
    await expect(page.locator('#siteFavorite option')).toHaveCount(2);
    // Removing the active favorite leaves the current plan intact until another site is used.
    await expect(page.locator('#siteBtn')).toContainText('Baker copy');
    const legacyId = await page
      .locator('#siteFavorite option')
      .filter({ hasText: 'Legacy ridge' })
      .getAttribute('value');
    await page.locator('#siteFavorite').selectOption(legacyId!);
    await expect(page.locator('#siteLocation')).toHaveValue('55.95, -3.19');
    await expect(page.locator('#siteElevation')).toHaveValue('1234');
    await expect(page.locator('#siteTz')).toHaveValue('Europe/London');
    await page.locator('#siteApply').click();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteBtn')).toContainText('Legacy ridge');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('bad pasted links leave the current site unchanged and make no requests', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#siteBtn').click();
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  for (const link of [
    'https://maps.app.goo.gl/example',
    'https://www.google.com/maps/@47.6,-122.3,12z',
  ]) {
    await page.locator('#siteLocation').fill(link);
    await page.locator('#siteApply').click();
    await expect(page.locator('#siteErr')).toBeVisible();
    await expect(page.locator('#siteBtn')).toContainText('Seattle');
  }
  expect(requests).toEqual([]);
  expect(new URL(page.url()).search).toBe('');
});

test('failed writes and damaged storage are visible and never erase existing data', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('npa:favorites', '{unreadable old data');
  });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#siteBtn').click();
  await expect(page.locator('#siteStorage')).toContainText('left unchanged');
  await page.locator('#siteName').fill('Temporary ridge');
  await page.locator('#siteApply').click();
  await expect(page.locator('#siteStorageNotice')).toContainText('left unchanged');
  expect(await page.evaluate(() => localStorage.getItem('npa:favorites'))).toBe(
    '{unreadable old data',
  );
  await expect(page.locator('#siteBtn')).toContainText('Temporary ridge');
});

test('storage write failure still permits a temporary site', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable');
    };
  });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#siteBtn').click();
  await page.locator('#siteName').fill('Temporary site');
  await page.locator('#siteApply').click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteStorageNotice')).toContainText('cannot be kept');
  await expect(page.locator('#siteBtn')).toContainText('Temporary site');
});
