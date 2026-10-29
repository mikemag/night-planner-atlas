import { expect, test } from '@playwright/test';

for (const width of [1512, 390]) {
  test(`offline zone lookup covers remote sites, boundaries and manual overrides at ${width}px`, async ({
    page,
    context,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('#siteSel').selectOption('manage');
    const point = async (lat: string, lon: string, zone: string) => {
      await page.locator('#siteLocation').fill(`${lat}, ${lon}`);
      await expect(page.locator('#siteTz')).toHaveValue(zone);
    };
    await point('47.60621', '-122.34253', 'America/Los_Angeles');
    await point('55.95', '-3.19', 'Europe/London');
    await point('-33.87', '151.21', 'Australia/Sydney');
    await point('35.8367', '-110.5045', 'America/Phoenix');
    await point('35.6806', '-109.0526', 'America/Denver');
    await point('44.0266', '-116.9629', 'America/Boise');
    await point('44.7749', '-117.8344', 'America/Los_Angeles');
    await context.setOffline(true);
    await point('27.7172', '85.3240', 'Asia/Kathmandu');
    await point('-31.677', '128.883', 'Australia/Eucla');
    await point('21.3069', '-157.8583', 'Pacific/Honolulu');
    // A manual override during a pending lookup must win, even after its debounce expires.
    await page.locator('#siteLocation').fill('47.60621, -122.34253');
    await page.locator('#siteTz').fill('Etc/UTC');
    await page.waitForTimeout(350);
    await expect(page.locator('#siteTz')).toHaveValue('Etc/UTC');
    await expect(page.locator('#siteZoneStatus')).toHaveText('Manual time-zone override.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
    expect(requests.some((url) => url.includes('47.60621') || url.includes('157.8583'))).toBe(
      false,
    );
  });
}

test('a failed lookup leaves deliberate manual entry usable', async ({ page }) => {
  await page.route('**/*.wasm', (route) => route.abort());
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#siteLocation').fill('55.95, -3.19');
  await expect(page.locator('#siteZoneStatus')).toContainText('lookup is unavailable');
  await page.locator('#siteApply').click();
  await expect(page.locator('#siteTzErr')).toContainText('lookup is unavailable');
  await expect(page.locator('#siteTz')).toBeFocused();
  await page.locator('#siteTz').fill('Europe/London');
  await page.locator('#siteApply').click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteClock')).toContainText('Europe/London');
});

test('startup loads lookup bytes before the first site edit, and ambiguous zones need a choice', async ({
  page,
  context,
}) => {
  const wasm = page.waitForResponse((response) => response.url().endsWith('.wasm'));
  await page.goto('./');
  await (await wasm).finished();
  await expect(page.locator('#loading')).toBeHidden();
  await context.setOffline(true);
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#siteLocation').fill('27.7172, 85.3240');
  await expect(page.locator('#siteTz')).toHaveValue('Asia/Kathmandu');
  await context.setOffline(false);
  await page.route(/timezones\.worker.*\.js$/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `postMessage({ready:true}); onmessage = ({data}) => postMessage({id:data.id,zones:['America/Denver','America/Phoenix']});`,
    }),
  );
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#siteLocation').fill('35.8, -110.5');
  await expect(page.locator('#siteZoneStatus')).toContainText('More than one zone');
  await expect(page.locator('#siteTz')).toHaveValue('');
  await expect(page.locator('#siteZoneChoices option')).toHaveCount(2);
  await page.locator('#siteApply').click();
  await expect(page.locator('#siteTzErr')).toContainText('More than one zone');
  await expect(page.locator('#siteTz')).toHaveAttribute('aria-invalid', 'true');
  expect(await page.evaluate(() => window.__npa!.S.site.name)).toBe('Seattle');
  await page.locator('#siteTz').fill('America/Denver');
  await page.locator('#siteApply').click();
  await expect(page.locator('#sitePop')).not.toBeVisible();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteClock')).toContainText('America/Denver');
});

test('editing or closing during a save lookup never applies a stale draft', async ({ page }) => {
  await page.route(/timezones\.worker.*\.js$/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `postMessage({ready:true}); onmessage = ({data}) => setTimeout(() => postMessage({id:data.id,zones:['America/Los_Angeles']}), 400);`,
    }),
  );
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#siteTz').fill('');
  await page.locator('#siteApply').click();
  await expect(page.locator('#siteApply')).toBeDisabled();
  await page.locator('#siteName').fill('Changed while finding zone');
  await expect(page.locator('#siteApply')).toBeEnabled();
  await expect(page.locator('#siteTz')).toHaveValue('America/Los_Angeles');
  await expect(page.locator('#sitePop')).toBeVisible();
  expect(await page.evaluate(() => window.__npa!.S.site.name)).toBe('Seattle');
  expect(await page.evaluate(() => localStorage.getItem('npa:favorites'))).toBeNull();
  await page.locator('#siteTz').fill('');
  await page.locator('#siteApply').click();
  await expect(page.locator('#siteApply')).toBeDisabled();
  await page.locator('#siteCancel').click();
  await page.locator('#siteSel').selectOption('manage');
  await expect(page.locator('#siteApply')).toBeEnabled();
  await expect(page.locator('#siteName')).toHaveValue('Seattle');
  await page.locator('#siteName').fill('Current draft');
  await page.locator('#siteApply').click();
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => window.__npa!.S.site.name)).toBe('Current draft');
});
