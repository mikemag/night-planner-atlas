import { expect, test } from '@playwright/test';
import { createSiteLink, readSharedLink } from '../src/app/share-state';
import { openAppMenu, openShare } from './header-controls';
import { openCurrentSiteEditor } from './site-controls';
import { readPersonal, seedPersonal } from './storage';

const ownSite = {
  id: 'mine',
  name: 'My Sydney site',
  lat: -33.87,
  lon: 151.21,
  tz: 'Australia/Sydney',
};
const ownPrefs = { view: 'river', riverZoom: 'year', focus: 7, moonAlt: 5, crescent: 0.1 } as const;
const site = {
  name: 'Club & friends <observing site>',
  lat: 45,
  lon: -120,
  tz: 'America/Los_Angeles',
  elevation: 500,
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2028-05-12T00:00:00Z'));
  await seedPersonal(page, {
    sites: [ownSite],
    active: { id: ownSite.id },
    preferences: ownPrefs,
  });
});

for (const width of [1512, 390]) {
  test(`Share site welcomes new recipients and skips repeat visits at ${width}px`, async ({
    page,
    browserName,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    // An unsaved current site lets this browser act as author and then as a new recipient.
    await seedPersonal(page, { site });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await openAppMenu(page);
    await page.getByRole('menuitem', { name: 'Share site…', exact: true }).click();
    const welcome = page.getByRole('checkbox', { name: 'Welcome the recipient', exact: true });
    await expect(welcome).not.toBeChecked();
    const ordinary = await page.locator('#shareLink').inputValue();
    expect(readSharedLink(new URL(ordinary).hash)).toEqual({ v: 2, site });
    await welcome.check();
    const link = await page.locator('#shareLink').inputValue();
    expect(readSharedLink(new URL(link).hash)).toEqual({ v: 2, site, welcome: true });
    await welcome.uncheck();
    await expect(page.locator('#shareLink')).toHaveValue(ordinary);
    await welcome.check();
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-welcome-option-${width}.png`,
      });
    await page.locator('#shareClose').click();
    await openShare(page);
    await expect(welcome).toBeHidden();
    expect(new URL(await page.locator('#shareLink').inputValue()).hash).not.toContain('welcome');
    await page.locator('#shareClose').click();
    await openAppMenu(page);
    await page.getByRole('menuitem', { name: 'Share site…', exact: true }).click();
    await expect(welcome).not.toBeChecked();
    await page.locator('#shareClose').click();

    await page.goto(link);
    const dialog = page.getByRole('dialog', {
      name: 'Welcome to Night Planner Atlas',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#welcomeSiteName')).toHaveText(site.name);
    await expect(page.locator('#welcomeSiteName > *')).toHaveCount(0);
    await expect(page.locator('#sharedNotice')).toBeHidden();
    await expect(page.locator('#welcomeExplore')).toBeFocused();
    // macOS WebKit uses Option+Tab to include buttons with its default keyboard settings.
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(page.locator('#welcomeUndo')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#welcomeClose')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#welcomeUndo')).toBeFocused();
    await expect(page.locator('#loading')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await page.evaluate(() => window.__npa!.nights[0].id)).toBe('2028-04-01');
    expect(await page.evaluate(() => window.__npa!.S.site)).toEqual(site);
    const saved = await readPersonal(page);
    expect(saved.preferences).toEqual(ownPrefs);
    expect(saved.sites).toEqual([{ ...site, id: expect.any(String) }, ownSite]);
    expect(saved.active).toEqual({ id: saved.sites[0].id });
    expect(new URL(page.url()).hash).toBe('');
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-welcome-${width}.png`,
      });
    await page.locator('#welcomeExplore').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#siteSel')).toBeFocused();

    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(dialog).toBeHidden();
    expect((await readPersonal(page)).sites).toEqual(saved.sites);
    // Matching locations keep the recipient's name and metadata, even in a welcome link.
    const renamed = createSiteLink(
      page.url(),
      { ...site, name: 'Another name', elevation: 900 },
      true,
    );
    await page.goto(renamed);
    await expect(page).toHaveURL((url) => url.hash === '');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#sharedNotice')).toBeHidden();
    expect((await readPersonal(page)).sites).toEqual(saved.sites);
    expect(await page.evaluate(() => window.__npa!.S.site)).toEqual(site);
  });
}

test('welcome Undo removes only the addition and reload does not reimport it', async ({
  page,
  baseURL,
}) => {
  await page.goto(createSiteLink(baseURL!, site, true));
  await expect(page.locator('#welcomeExplore')).toBeFocused();
  await expect(page.locator('#loading')).toBeHidden();
  // The welcome has no notice timeout, even after the planner has finished loading.
  await page.clock.fastForward(60_000);
  await expect(page.locator('#welcomeDialog')).toBeVisible();
  await expect(page.locator('#sharedNotice')).toBeHidden();
  await page.locator('#welcomeUndo').press('Enter');
  await expect(page.locator('#welcomeStatus')).toContainText('removed from saved sites');
  await expect(page.locator('#welcomeUndo')).toBeHidden();
  await expect(page.locator('#welcomeExplore')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#welcomeClose')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#welcomeExplore')).toBeFocused();
  expect((await readPersonal(page)).sites).toEqual([ownSite]);
  expect((await readPersonal(page)).active).toEqual({ id: ownSite.id });
  expect(await page.evaluate(() => window.__npa!.S.site)).toEqual(site);
  await page.locator('#welcomeExplore').click();
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#welcomeDialog')).toBeHidden();
  await expect(page.locator('#sharedNotice')).toBeHidden();
  expect((await readPersonal(page)).sites).toEqual([ownSite]);
  await expect.poll(() => page.evaluate(() => window.__npa?.S.site.name)).toBe(ownSite.name);
});

for (const dismiss of ['Escape', 'Close', 'backdrop']) {
  test(`${dismiss} dismisses the welcome and keeps the saved site`, async ({ page, baseURL }) => {
    await page.goto(createSiteLink(baseURL!, site, true));
    await expect(page.locator('#welcomeDialog')).toBeVisible();
    if (dismiss === 'Escape') await page.keyboard.press('Escape');
    else if (dismiss === 'Close') await page.locator('#welcomeClose').click();
    else await page.locator('#welcomeDialog').click({ position: { x: 2, y: 2 } });
    await expect(page.locator('#welcomeDialog')).toBeHidden();
    await expect(page.locator('#siteSel')).toBeFocused();
    await expect(page.locator('#sharedNotice')).toBeHidden();
    expect((await readPersonal(page)).sites[0]).toMatchObject(site);
  });
}

test('welcome explains unavailable storage without claiming a save or offering Undo', async ({
  page,
  baseURL,
}) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const original = await page.evaluate(() => {
    const raw = localStorage.getItem('npa:personal');
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'npa:personal') throw new DOMException('Storage full', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
    return raw;
  });
  const hash = new URL(createSiteLink(baseURL!, site, true)).hash;
  await page.evaluate((hash) => {
    location.hash = hash;
  }, hash);
  await expect(page.locator('#welcomeDialog')).toBeVisible();
  await expect(page.locator('#welcomeStatus')).toHaveText(
    'You can explore this site for this visit. Browser storage is unavailable.',
  );
  await expect(page.locator('#welcomeUndo')).toBeHidden();
  await expect(page.locator('#sharedNotice')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('npa:personal'))).toBe(original);
  expect(new URL(page.url()).hash).toBe(hash);
  await page.locator('#welcomeExplore').click();
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => window.__npa!.S.site)).toEqual(site);
});

test('welcome Undo preserves a later edit in another tab', async ({ page, context, baseURL }) => {
  const link = createSiteLink(baseURL!, site, true);
  await page.goto(link);
  await expect(page.locator('#welcomeDialog')).toBeVisible();
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.locator('#loading')).toBeHidden();
  await expect(other.locator('#welcomeDialog')).toBeHidden();
  await openCurrentSiteEditor(other);
  await other.locator('#siteName').fill('My renamed club site');
  await other.locator('#siteApply').click();
  await expect(other.locator('#sitePop')).toBeHidden();
  await page.locator('#welcomeUndo').click();
  await expect(page.locator('#welcomeStatus')).toContainText('saved data was kept');
  await expect(page.locator('#welcomeUndo')).toBeHidden();
  await expect(page.locator('#welcomeExplore')).toBeFocused();
  const saved = await readPersonal(page);
  expect(saved.sites).toHaveLength(2);
  expect(saved.sites[0].name).toBe('My renamed club site');
  expect(saved.sites[1]).toEqual(ownSite);
});
