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
    await page.locator('#siteBtn').click();
    const point = async (lat: string, lon: string, zone: string) => {
      await page.locator('#siteLat').fill(lat);
      await page.locator('#siteLon').fill(lon);
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
    await page.locator('#siteLat').fill('47.60621');
    await page.locator('#siteLon').fill('-122.34253');
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
  await page.locator('#siteBtn').click();
  await page.locator('#siteLat').fill('55.95');
  await page.locator('#siteLon').fill('-3.19');
  await expect(page.locator('#siteZoneStatus')).toContainText('lookup is unavailable');
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
  await page.locator('#siteBtn').click();
  await page.locator('#siteLat').fill('27.7172');
  await page.locator('#siteLon').fill('85.3240');
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
  await page.locator('#siteBtn').click();
  await page.locator('#siteLat').fill('35.8');
  await page.locator('#siteLon').fill('-110.5');
  await expect(page.locator('#siteZoneStatus')).toContainText('More than one zone');
  await expect(page.locator('#siteTz')).toHaveValue('');
  await expect(page.locator('#siteZoneChoices option')).toHaveCount(2);
});
