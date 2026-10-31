import { expect, test } from '@playwright/test';
import { DEFAULT_SITES } from '../src/app/default-sites';

for (const width of [1512, 390]) {
  test(`starter sites switch complete records offline and retain the choice at ${width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    const wasm = page.waitForResponse((response) => response.url().endsWith('.wasm'));
    await page.goto('./');
    await (await wasm).finished();
    await expect(page.locator('#loading')).toBeHidden();
    const picker = page.getByRole('combobox', { name: 'Observing site', exact: true });
    await expect(picker).toHaveValue('site:seattle-paramount-park');
    await expect(picker.locator('option')).toHaveCount(7);
    await context.setOffline(true);
    for (const { id, ...site } of DEFAULT_SITES) {
      await picker.selectOption(`site:${id}`);
      await expect(page.locator('#loading')).toBeHidden();
      expect(await page.evaluate(() => window.__npa!.S.site)).toEqual(site);
      await expect(page.locator('#siteClock')).toContainText(site.tz);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-starter-sites-${width}.png`,
      });
    await picker.selectOption('manage');
    await expect(page.locator('#siteFavorite option')).toHaveCount(6);
    await expect(page.locator('#siteName')).toHaveValue('Svalbard, Kjell Henriksen Observatory');
    await expect(page.locator('#siteElevation')).toHaveValue('520');
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-starter-sites-editor-${width}.png`,
      });
    await context.setOffline(false);
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(picker).toHaveValue('site:svalbard-kjell-henriksen-observatory');
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('npa:favorites')!).sites),
    ).toEqual(DEFAULT_SITES);
  });

  test(`site errors belong to their fields and a cleared zone is inferred on save offline at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    const wasm = page.waitForResponse((response) => response.url().endsWith('.wasm'));
    await page.goto('./');
    await (await wasm).finished();
    await expect(page.locator('#loading')).toBeHidden();
    await context.setOffline(true);
    await page.locator('#siteSel').selectOption('manage');
    await expect(page.locator('#sitePop')).not.toContainText('OpenStreetMap');
    await expect(page.locator('#siteFavorite option:checked')).toHaveText(
      'Seattle, Paramount Park',
    );
    await expect(page.locator('#siteCoordinates')).toBeHidden();
    await page.locator('#siteAdd').click();
    await expect(page.locator('#siteCoordinates')).toBeHidden();
    await page.locator('#siteApply').click();
    await expect(page.locator('#siteLocation')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#siteLocation')).toBeFocused();
    await expect(
      page
        .locator('.site-field')
        .filter({ has: page.locator('#siteLocation') })
        .getByRole('alert'),
    ).toBeVisible();
    await page.locator('#siteName').fill('Test hill');
    await page.locator('#siteLocation').fill('https://maps.google.com/?q=55.95,-3.19');
    await expect(page.locator('#siteLocationErr')).toBeHidden();
    await expect(page.locator('#siteLocation')).not.toHaveAttribute('aria-invalid');
    await expect(page.locator('#siteCoordinates')).toHaveText(
      'Coordinates from link: latitude 55.95°, longitude -3.19°',
    );
    await page.locator('#siteElevation').fill('10001');
    await page.locator('#siteApply').click();
    await expect(page.locator('#siteElevation')).toBeFocused();
    await expect(page.locator('#siteElevation')).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page
        .locator('.site-field')
        .filter({ has: page.locator('#siteElevation') })
        .getByRole('alert'),
    ).toContainText('10,000');
    await page.locator('#siteElevation').fill('1234');
    await page.locator('#siteTz').fill('Mars/Olympus_Mons');
    await page.locator('#siteApply').click();
    await expect(page.locator('#siteTz')).toBeFocused();
    await expect(page.locator('#siteTz')).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page
        .locator('.site-field')
        .filter({ has: page.locator('#siteTz') })
        .getByRole('alert'),
    ).toContainText('valid IANA time zone');
    await page.locator('#siteTz').fill('');
    await expect(page.locator('#siteTzErr')).toBeHidden();
    await page.locator('#siteApply').click();
    await expect(page.locator('#sitePop')).not.toBeVisible();
    await expect(page.locator('#loading')).toBeHidden();
    const site = {
      name: 'Test hill',
      lat: 55.95,
      lon: -3.19,
      tz: 'Europe/London',
      elevation: 1234,
    };
    expect(await page.evaluate(() => window.__npa!.S.site)).toEqual(site);
    await page.locator('#siteSel').selectOption('manage');
    await page.locator('#siteTz').fill('');
    await page.locator('#siteApply').click();
    await expect(page.locator('#sitePop')).not.toBeVisible();
    await expect(page.locator('#loading')).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('npa:site')!))).toEqual(site);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });

  test(`the site dropdown switches complete records directly and keeps management separate at ${width}px`, async ({
    page,
    context,
  }, info) => {
    const record = {
      name: 'Dark ridge',
      lat: 55.95,
      lon: -3.19,
      tz: 'Europe/London',
      elevation: 1234,
    };
    const sites = [
      {
        id: 'west',
        name: 'Dark ridge',
        lat: 47.60621,
        lon: -122.34253,
        tz: 'America/Los_Angeles',
      },
      { id: 'east', ...record },
    ];
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.addInitScript((sites) => {
      if (!localStorage.getItem('npa:favorites'))
        localStorage.setItem(
          'npa:favorites',
          JSON.stringify({ version: 1, starterVersion: 1, sites, selectedId: 'west' }),
        );
    }, sites);
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    const picker = page.getByRole('combobox', { name: 'Observing site', exact: true });
    await expect(picker).toHaveValue('site:west');
    await expect(picker.locator('option')).toHaveCount(3);
    await expect(picker.locator('option').last()).toHaveText('Manage sites…');
    await context.setOffline(true);
    await picker.selectOption('site:east');
    await expect(page.locator('#sitePop')).not.toBeVisible();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteClock')).toContainText('Europe/London');
    expect(await page.evaluate(() => window.__npa!.S.site)).toEqual(record);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('npa:site')!))).toEqual(
      record,
    );
    const stored = await page.evaluate(() => localStorage.getItem('npa:favorites'));
    expect(JSON.parse(stored!)).toEqual({
      version: 1,
      starterVersion: 1,
      sites,
      selectedId: 'east',
    });
    await picker.selectOption('manage');
    await expect(page.getByRole('dialog', { name: 'Observing sites' })).toBeVisible();
    await expect(picker).toHaveValue('site:east');
    await expect(page.locator('#siteLocation')).toHaveValue('55.95, -3.19');
    await expect(page.locator('#siteElevation')).toHaveValue('1234');
    await page.locator('#siteName').fill('Unsaved edit');
    await page.keyboard.press('Escape');
    await expect(picker).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('npa:favorites'))).toBe(stored);
    expect(await page.evaluate(() => window.__npa!.S.site)).toEqual(record);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-site-picker-${width}.png`,
      });
    await context.setOffline(false);
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(picker).toHaveValue('site:east');
    await picker.selectOption('site:west');
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteClock')).toContainText('America/Los_Angeles');
    expect(await page.evaluate(() => window.__npa!.S.site.elevation)).toBeUndefined();
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('npa:favorites')!).sites),
    ).toEqual(sites);
  });

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
    await page.locator('#siteSel').selectOption('manage');
    await expect(page.locator('#siteFavorite option')).toHaveCount(7);
    await page.locator('#siteName').fill('Unsaved edit');
    await page.keyboard.press('Escape');
    await expect(page.locator('#siteSel')).toBeFocused();
    await expect(page.locator('#siteSel option:checked')).toContainText('Legacy ridge');
    await page.locator('#siteSel').selectOption('manage');
    await expect(page.locator('#siteName')).toHaveValue('Legacy ridge');
    await page.locator('#siteAdd').click();
    await page
      .locator('#siteLocation')
      .fill(
        'https://www.google.com/maps/search/?api=1&query=44.7749,-117.8344&utm_source=discard-me',
      );
    await expect(page.locator('#siteCoordinates')).toHaveText(
      'Coordinates from link: latitude 44.7749°, longitude -117.8344°',
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
    expect(JSON.parse(stored).sites).toHaveLength(8);
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteSel option:checked')).toContainText('Baker ridge');
    await page.locator('#siteSel').selectOption('manage');
    await expect(page.locator('#siteElevation')).toHaveValue('2000');
    await page.locator('#siteDuplicate').click();
    await page.locator('#siteCancel').click();
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('npa:favorites')!).sites.length),
    ).toBe(8);
    await page.locator('#siteSel').selectOption('manage');
    await page.locator('#siteDuplicate').click();
    await page.locator('#siteName').fill('Baker copy');
    await page.locator('#siteApply').click();
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('#siteSel').selectOption('manage');
    await page.locator('#siteRemove').click();
    await page.locator('#siteKeep').click();
    await expect(page.locator('#siteFavorite option')).toHaveCount(9);
    await page.locator('#siteRemove').click();
    await page.locator('#siteConfirmRemove').click();
    await expect(page.locator('#siteFavorite option')).toHaveCount(8);
    // Removing the active favorite leaves the current plan intact until another site is used.
    await expect(page.locator('#siteSel option:checked')).toContainText('Baker copy');
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
    await expect(page.locator('#siteSel option:checked')).toContainText('Legacy ridge');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('bad pasted links leave the current site unchanged and make no requests', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#siteSel').selectOption('manage');
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  for (const link of [
    'https://maps.app.goo.gl/example',
    'https://www.google.com/maps/@47.6,-122.3,12z',
  ]) {
    await page.locator('#siteLocation').fill(link);
    await page.locator('#siteApply').click();
    await expect(page.locator('#siteLocationErr')).toBeVisible();
    await expect(page.locator('#siteLocation')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#siteLocationErr')).toContainText('paste them here');
    await expect(page.locator('#siteSel option:checked')).toContainText('Seattle');
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
  await page.locator('#siteSel').selectOption('manage');
  await expect(page.locator('#siteStorage')).toContainText('left unchanged');
  await page.locator('#siteName').fill('Temporary ridge');
  await page.locator('#siteApply').click();
  await expect(page.locator('#siteStorageNotice')).toContainText('left unchanged');
  expect(await page.evaluate(() => localStorage.getItem('npa:favorites'))).toBe(
    '{unreadable old data',
  );
  await expect(page.locator('#siteSel option:checked')).toContainText('Temporary ridge');
});

test('storage write failure still permits a temporary site', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable');
    };
  });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#siteDuplicate').click();
  await page.locator('#siteName').fill('Temporary site');
  await page.locator('#siteApply').click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteStorageNotice')).toContainText('cannot be kept');
  await expect(page.locator('#siteSel option:checked')).toContainText('Temporary site');
  await page.locator('#siteSel').selectOption('site:seattle-paramount-park');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteSel option:checked')).toContainText('Seattle');
  await page.locator('#siteSel').selectOption('manage');
  await expect(page.locator('#siteStorage')).toContainText('cannot be kept');
});
