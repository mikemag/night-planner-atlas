import { expect, test, type Browser, type Page } from '@playwright/test';

const ownSite = {
  name: 'My Sydney site',
  lat: -33.87,
  lon: 151.21,
  tz: 'Australia/Sydney',
  elevation: 321,
};
const ownBook = { version: 1, sites: [{ ...ownSite, id: 'mine' }], selectedId: 'mine' };
const ownPrefs = { view: 'river', riverZoom: 'year', focus: 7, moonAlt: 5, crescent: 0.1 };

async function receiver(browser: Browser) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    timezoneId: 'Pacific/Auckland',
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2028-05-12T00:00:00Z'));
  await page.addInitScript(
    ({ site, book, prefs }) => {
      if (localStorage.getItem('npa:seeded')) return;
      localStorage.setItem('npa:site', JSON.stringify(site));
      localStorage.setItem('npa:favorites', JSON.stringify(book));
      for (const [key, value] of Object.entries(prefs))
        localStorage.setItem('npa:' + key, JSON.stringify(value));
      localStorage.setItem('npa:seeded', 'true');
    },
    { site: ownSite, book: ownBook, prefs: ownPrefs },
  );
  return { context, page };
}

async function favorites(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('npa:favorites')!));
}

async function openAuthor(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    const a = window.__npa!;
    const i = a.nights.findIndex((night) => night.id === '2026-10-31');
    a.select(i, true, true);
    a.toggleRiverNight(i);
  });
}

test('a site-free link restores dates and controls later while preserving recipient preferences', async ({
  page,
  browser,
}) => {
  await openAuthor(page);
  await page.locator('#moonAltSel').selectOption('10');
  await page.locator('#crescentSel').selectOption('0.2');
  await page.locator('#focusSeg button[data-val="3"]').click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByLabel('Include this site', { exact: true })).not.toBeChecked();
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const payload = Object.fromEntries(new URLSearchParams(new URL(link).hash.slice(1)));
  for (const key of ['site', 'name', 'lat', 'lon', 'tz', 'elevation'])
    expect(payload).not.toHaveProperty(key);
  expect(payload).toMatchObject({
    npa: '1',
    view: 'river',
    start: '2026-09',
    night: '2026-10-31',
    expanded: '1',
    crescent: '20',
  });
  const target = await receiver(browser);
  try {
    await target.page.goto(link);
    await expect(target.page.locator('#sharedNotice')).toBeVisible();
    await expect(target.page.locator('#loading')).toBeHidden();
    await expect(target.page.locator('#sharedNoticeText')).toContainText('your own site');
    const state = await target.page.evaluate(() => {
      const a = window.__npa!;
      return {
        site: a.S.site,
        first: a.nights[0].id,
        selected: a.nights[a.S.sel].id,
        focus: a.S.focus,
        moonAlt: a.S.moonAlt,
        crescent: a.S.crescent,
        expanded: a.S.riverExpanded,
        saved: Object.fromEntries(
          ['view', 'riverZoom', 'focus', 'moonAlt', 'crescent'].map((key) => [
            key,
            JSON.parse(localStorage.getItem('npa:' + key)!),
          ]),
        ),
      };
    });
    expect(state).toMatchObject({
      site: ownSite,
      first: '2026-09-01',
      selected: '2026-10-31',
      focus: 3,
      moonAlt: 10,
      crescent: 0.2,
      expanded: true,
      saved: ownPrefs,
    });
    expect(await favorites(target.page)).toEqual(ownBook);
    await target.page.locator('#focusSeg button[data-val="0"]').click();
    expect(await target.page.evaluate(() => JSON.parse(localStorage.getItem('npa:focus')!))).toBe(
      7,
    );
    await target.page.locator('#shareKeepSettings').click();
    expect(await target.page.evaluate(() => JSON.parse(localStorage.getItem('npa:focus')!))).toBe(
      0,
    );
    expect(await favorites(target.page)).toEqual(ownBook);
    await target.page.locator('#shareRestore').click();
    await expect(target.page.locator('#sharedNotice')).toBeHidden();
    await expect(target.page.locator('#loading')).toBeHidden();
    expect(await target.page.evaluate(() => window.__npa!.nights[0].id)).toBe('2028-04-01');
    expect(new URL(target.page.url()).hash).toBe('');
  } finally {
    await target.context.close();
  }
});

test('including a site requires a preview and saving it never replaces existing favorites', async ({
  page,
  browser,
}, info) => {
  await openAuthor(page);
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#siteAdd').click();
  await page.locator('#siteName').fill('Private meadow');
  await page.locator('#siteLocation').fill('47.123, -121.987');
  await expect(page.locator('#siteTz')).toHaveValue('America/Los_Angeles');
  await page.locator('#siteElevation').fill('1234');
  await page.locator('#siteApply').click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByLabel('Include this site', { exact: true }).check();
  await expect(page.locator('#shareSiteFields')).toContainText('Private meadow');
  await expect(page.locator('#shareSiteFields')).toContainText('47.123');
  await expect(page.locator('#shareSiteFields')).toContainText('1234');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByLabel('Include this site', { exact: true })).not.toBeChecked();
  await page.getByLabel('Include this site', { exact: true }).check();
  if (process.env.SCREENSHOTS)
    await page.screenshot({ path: `test-results/screenshots/${info.project.name}-share-site.png` });
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  const target = await receiver(browser);
  try {
    const requests: string[] = [];
    target.page.on('request', (r) => requests.push(r.url()));
    await target.page.goto(link);
    await expect(target.page.locator('#loading')).toBeHidden();
    await expect(target.page.locator('#siteSel option:checked')).toContainText('Private meadow');
    expect(await favorites(target.page)).toEqual(ownBook);
    expect(await target.page.evaluate(() => JSON.parse(localStorage.getItem('npa:site')!))).toEqual(
      ownSite,
    );
    await target.page.locator('#shareKeepSettings').click();
    expect(await favorites(target.page)).toEqual(ownBook);
    await target.page.locator('#shareReviewSite').click();
    await expect(target.page.locator('#siteName')).toHaveValue('Private meadow');
    await expect(target.page.locator('#siteElevation')).toHaveValue('1234');
    await target.page.locator('#siteCancel').click();
    expect(await favorites(target.page)).toEqual(ownBook);
    await target.page.locator('#shareReviewSite').click();
    await target.page.locator('#siteApply').click();
    await expect(target.page.locator('#loading')).toBeHidden();
    const saved = await favorites(target.page);
    expect(saved.sites).toHaveLength(2);
    expect(saved.sites[0]).toEqual(ownBook.sites[0]);
    expect(saved.sites[1]).toMatchObject({
      name: 'Private meadow',
      lat: 47.123,
      lon: -121.987,
      elevation: 1234,
    });
    expect(requests.every((url) => new URL(url).origin === new URL(link).origin)).toBe(true);
    expect(requests.some((url) => /47\.123|Private.meadow|121\.987/.test(url))).toBe(false);
  } finally {
    await target.context.close();
  }
});

test('bad links preserve saved data and clipboard failure gives a manual copy path', async ({
  page,
  browser,
}) => {
  const target = await receiver(browser);
  try {
    await target.page.goto('./#npa=%invalid');
    await expect(target.page.locator('#loading')).toBeHidden();
    await expect(target.page.locator('#sharedNoticeText')).toContainText(
      'saved settings were not changed',
    );
    expect(await favorites(target.page)).toEqual(ownBook);
  } finally {
    await target.context.close();
  }
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('Copy denied')) },
    }),
  );
  await openAuthor(page);
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.locator('#shareStatus')).toContainText('link is selected');
  await expect(page.locator('#shareLink')).toBeFocused();
  const selection = await page.locator('#shareLink').evaluate((el: HTMLTextAreaElement) => ({
    start: el.selectionStart,
    end: el.selectionEnd,
    length: el.value.length,
  }));
  expect(selection.start).toBe(0);
  expect(selection.end).toBe(selection.length);
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {};
  });
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.locator('#shareStatus')).toHaveText('Link copied.');
  await page.keyboard.press('Escape');
  await expect(page.locator('#shareBtn')).toBeFocused();
  const link = await page.locator('#shareLink').inputValue();
  const url = new URL(link);
  const next = new URLSearchParams(url.hash.slice(1));
  expect(next.get('npa')).toBe('1');
  next.set('night', '2026-10-09');
  next.delete('expanded');
  next.set('focus', '7');
  url.hash = next.toString();
  await page.evaluate((hash) => {
    location.hash = hash;
  }, url.hash);
  await expect(page.locator('#sharedNotice')).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id)).toBe(
    '2026-10-09',
  );
  expect(await page.evaluate(() => window.__npa!.S.focus)).toBe(7);
});
