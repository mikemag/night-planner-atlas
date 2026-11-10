import { openAppMenu, openShare, chooseFocus, chooseMoon } from './header-controls';
import { createShareLink, createSiteLink } from '../src/app/share-state';
import { seedPersonal, readPersonal, readSite, readPreference } from './storage';
import { expect, test, type Browser, type Page } from '@playwright/test';

const ownSite = {
  name: 'My Sydney site',
  lat: -33.87,
  lon: 151.21,
  tz: 'Australia/Sydney',
  elevation: 321,
};
const ownBook = {
  version: 1,
  starterVersion: 1,
  sites: [{ ...ownSite, id: 'mine' }],
  selectedId: 'mine',
};
const ownPrefs = { view: 'river', riverZoom: 'year', focus: 7, moonAlt: 5, crescent: 0.1 };

async function receiver(browser: Browser) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    timezoneId: 'Pacific/Auckland',
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2028-05-12T00:00:00Z'));
  await seedPersonal(page, {
    sites: ownBook.sites,
    active: { id: 'mine' },
    preferences: ownPrefs as never,
  });
  return { context, page };
}

async function favorites(page: Page) {
  const data = await readPersonal(page);
  return {
    version: data.version,
    starterVersion: data.starterVersion,
    sites: data.sites,
    selectedId: 'id' in data.active ? data.active.id : null,
  };
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

const invitationSite = {
  name: 'Example observing site',
  lat: 45,
  lon: -120,
  tz: 'America/Los_Angeles',
  elevation: 500,
};

test('site invitations open around today, auto-save with Undo, and stay undone on reload', async ({
  page,
  browser,
}, info) => {
  await openAuthor(page);
  await openAppMenu(page);
  await page.getByRole('menuitem', { name: 'Share site…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Share site', exact: true })).toBeVisible();
  await expect(page.locator('#shareIncludeSiteChoice')).toBeHidden();
  const outgoing = new URL(await page.locator('#shareLink').inputValue());
  expect(outgoing.hash).toContain('#npa=2&name=');
  expect(outgoing.hash).not.toMatch(/start=|night=|view=|focus=|moonAlt=/);
  const target = await receiver(browser);
  try {
    const link = createSiteLink(page.url(), invitationSite);
    await target.page.goto(link);
    await expect(target.page.locator('#loading')).toBeHidden();
    await expect(target.page.locator('#shareAction')).toHaveText('Undo');
    expect(await target.page.evaluate(() => window.__npa!.nights[0].id)).toBe('2028-04-01');
    expect(await target.page.evaluate(() => window.__npa!.S.site)).toEqual(invitationSite);
    expect((await readPersonal(target.page)).preferences).toMatchObject(ownPrefs);
    expect((await favorites(target.page)).sites).toHaveLength(2);
    expect(new URL(target.page.url()).hash).toBe('');
    if (process.env.SCREENSHOTS)
      await target.page.screenshot({
        path: `test-results/screenshots/${info.project.name}-site-invitation.png`,
      });
    await target.page.locator('#shareAction').press('Enter');
    await expect(target.page.locator('#sharedNoticeText')).toContainText(
      'removed from saved sites',
    );
    await expect(target.page.locator('#shareDismiss')).toBeFocused();
    expect(await favorites(target.page)).toEqual(ownBook);
    expect(await target.page.evaluate(() => window.__npa!.S.site)).toEqual(invitationSite);
    await target.page.locator('#shareDismiss').click();
    await expect(target.page.locator('#sharedNotice')).toBeHidden();
    await target.page.reload();
    await expect(target.page.locator('#loading')).toBeHidden();
    expect(await target.page.evaluate(() => window.__npa!.S.site)).toEqual(ownSite);
    expect(await favorites(target.page)).toEqual(ownBook);
  } finally {
    await target.context.close();
  }
});

test('known site invitations reuse the saved name and metadata without a duplicate or save offer', async ({
  browser,
  baseURL,
}) => {
  const target = await receiver(browser);
  try {
    await target.page.goto('./');
    await expect(target.page.locator('#loading')).toBeHidden();
    await target.page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('npa:personal')!);
      value.preferences.view = 'notes';
      localStorage.setItem('npa:personal', JSON.stringify(value));
    });
    const link = createSiteLink(baseURL!, {
      ...ownSite,
      name: 'Shared club name',
      lat: ownSite.lat + 0.000004,
      elevation: 999,
    });
    await target.page.goto(link);
    await expect(target.page.locator('#loading')).toBeHidden();
    await expect(target.page.locator('#sharedNotice')).toBeHidden();
    await expect(target.page.locator('#notesView')).toBeHidden();
    expect(await favorites(target.page)).toEqual(ownBook);
    expect(await target.page.evaluate(() => window.__npa!.S.site)).toEqual(ownSite);
    await target.page.reload();
    await expect(target.page.locator('#loading')).toBeHidden();
    expect(await favorites(target.page)).toEqual(ownBook);
  } finally {
    await target.context.close();
  }
});

test('simultaneous invitations create one favorite and Undo preserves a later edit in another tab', async ({
  browser,
  baseURL,
}) => {
  const target = await receiver(browser);
  try {
    const other = await target.context.newPage();
    const link = createSiteLink(baseURL!, invitationSite);
    await Promise.all([target.page.goto(link), other.goto(link)]);
    await expect(target.page.locator('#loading')).toBeHidden();
    await expect(other.locator('#loading')).toBeHidden();
    expect((await favorites(target.page)).sites).toHaveLength(2);
    const owner = (await target.page.locator('#shareAction').isVisible()) ? target.page : other;
    const editor = owner === other ? target.page : other;
    await editor.locator('#siteSel').selectOption('manage');
    await editor.locator('#siteName').fill('My own ridge name');
    await editor.locator('#siteApply').click();
    await expect(editor.locator('#sitePop')).toBeHidden();
    await owner.locator('#shareAction').click();
    await expect(owner.locator('#sharedNoticeText')).toContainText('saved data was kept');
    expect((await favorites(owner)).sites).toHaveLength(2);
    expect((await favorites(owner)).sites[1].name).toBe('My own ridge name');
  } finally {
    await target.context.close();
  }
});

test('an obsolete queued invitation cannot save a site or replace a later link', async ({
  browser,
  baseURL,
}) => {
  const target = await receiver(browser);
  try {
    await target.page.goto('./');
    await expect(target.page.locator('#loading')).toBeHidden();
    await target.page.evaluate(async () => {
      const w = window as unknown as { releaseShareLock: () => void };
      await new Promise<void>((entered) => {
        void navigator.locks.request(
          'npa:personal',
          () =>
            new Promise<void>((release) => {
              w.releaseShareLock = release;
              entered();
            }),
        );
      });
    });
    const first = new URL(createSiteLink(baseURL!, { ...invitationSite, name: 'First', lat: 46 }))
      .hash;
    const last = new URL(createSiteLink(baseURL!, invitationSite)).hash;
    await target.page.evaluate((hash) => {
      location.hash = hash;
    }, first);
    await expect(target.page).toHaveURL(new RegExp('name=First'));
    await target.page.evaluate((hash) => {
      location.hash = hash;
    }, last);
    await expect(target.page).toHaveURL(new RegExp('name=Example'));
    await target.page.evaluate(() =>
      (window as unknown as { releaseShareLock: () => void }).releaseShareLock(),
    );
    await expect(target.page.locator('#sharedNoticeText')).toContainText(
      'Example observing site added',
    );
    await expect(target.page.locator('#loading')).toBeHidden();
    const saved = await favorites(target.page);
    expect(saved.sites).toHaveLength(2);
    expect(saved.sites[1].name).toBe(invitationSite.name);
  } finally {
    await target.context.close();
  }
});

test('unavailable storage keeps an invitation usable without overwriting the saved record', async ({
  browser,
  baseURL,
}) => {
  const target = await receiver(browser);
  try {
    await target.page.goto('./');
    await expect(target.page.locator('#loading')).toBeHidden();
    const raw = await target.page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('npa:personal')!);
      value.version = 99;
      const raw = JSON.stringify(value);
      localStorage.setItem('npa:personal', raw);
      return raw;
    });
    await target.page.goto(createSiteLink(baseURL!, invitationSite));
    await expect(target.page.locator('#loading')).toBeHidden();
    await expect(target.page.locator('#sharedNoticeText')).toContainText('for this visit');
    expect(await target.page.evaluate(() => window.__npa!.S.site)).toEqual(invitationSite);
    expect(await target.page.evaluate(() => localStorage.getItem('npa:personal'))).toBe(raw);
    await target.page.locator('#shareDismiss').click();
    await expect(target.page.locator('#sharedNotice')).toBeHidden();
  } finally {
    await target.context.close();
  }
});

test('a site-free plan opens directly and applies settings with normal persistence', async ({
  page,
  browser,
}) => {
  await openAuthor(page);
  await chooseMoon(page, 'moonAltSel', '10');
  await chooseMoon(page, 'crescentSel', '0.2');
  await chooseFocus(page, 3);
  await openShare(page);
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
    await expect(target.page.locator('#sharedNotice')).toBeHidden();
    await expect(target.page.locator('#loading')).toBeHidden();
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
            JSON.parse(localStorage.getItem('npa:personal')!).preferences[key],
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
      saved: { ...ownPrefs, riverZoom: 'month', focus: 3, moonAlt: 10, crescent: 0.2 },
    });
    expect(await favorites(target.page)).toEqual(ownBook);
    await chooseFocus(target.page, 0);
    await expect.poll(() => readPreference(target.page, 'focus')).toBe(0);
    expect(await favorites(target.page)).toEqual(ownBook);
    await target.page.reload();
    await expect(target.page.locator('#loading')).toBeHidden();
    await expect(target.page.locator('#sharedNotice')).toBeHidden();
    expect(await target.page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id)).toBe(
      '2026-10-31',
    );
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
  await expect(page.locator('#sitePop')).toBeHidden();
  await expect(page.locator('#loading')).toBeHidden();
  await openShare(page);
  await page.getByLabel('Include this site', { exact: true }).check();
  await expect(page.locator('#shareSiteFields')).toContainText('Private meadow');
  await expect(page.locator('#shareSiteFields')).toContainText('47.123');
  await expect(page.locator('#shareSiteFields')).toContainText('1234');
  await page.keyboard.press('Escape');
  await openShare(page);
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
    expect(await readSite(target.page)).toEqual(ownSite);
    await expect(target.page.locator('#shareAction')).toHaveText('Save site');
    await target.page.locator('#shareDismiss').click();
    await expect(target.page.locator('#sharedNotice')).toBeHidden();
    expect(await target.page.evaluate(() => window.__npa!.S.site.name)).toBe('Private meadow');
    expect(await favorites(target.page)).toEqual(ownBook);
    await target.page.reload();
    await expect(target.page.locator('#loading')).toBeHidden();
    await target.page.locator('#shareAction').click();
    await expect(target.page.locator('#shareAction')).toHaveText('Undo');
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
  await openShare(page);
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
  await expect(page.locator('#moreBtn')).toBeFocused();
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
  await expect(page.locator('#sharedNotice')).toBeHidden();
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id)).toBe(
    '2026-10-09',
  );
  expect(await page.evaluate(() => window.__npa!.S.focus)).toBe(7);
});

test('plan links reuse known locations and keep differing site metadata temporary without duplicate offers', async ({
  browser,
  baseURL,
}) => {
  const target = await receiver(browser);
  try {
    for (const elevation of [ownSite.elevation, 999]) {
      const site = { ...ownSite, name: 'Shared name', elevation };
      const link = createShareLink(baseURL!, {
        v: 1,
        start: '2026-09',
        view: 'river',
        riverZoom: 'month',
        calZoom: 'month',
        calOrient: 'v',
        focus: 0,
        moonAlt: 0,
        crescent: 0,
        night: null,
        expanded: false,
        site,
      });
      await target.page.goto(link);
      await expect(target.page.locator('#loading')).toBeHidden();
      await expect(target.page.locator('#sharedNotice')).toBeHidden();
      expect(await favorites(target.page)).toEqual(ownBook);
      expect(await target.page.evaluate(() => window.__npa!.S.site)).toEqual(
        elevation === ownSite.elevation ? ownSite : site,
      );
    }
  } finally {
    await target.context.close();
  }
});

test('dismissing a plan offer while its save is pending keeps the offer dismissed', async ({
  browser,
  baseURL,
}) => {
  const target = await receiver(browser);
  try {
    await target.page.goto(
      createShareLink(baseURL!, {
        v: 1,
        start: '2026-09',
        view: 'river',
        riverZoom: 'month',
        calZoom: 'month',
        calOrient: 'v',
        focus: 0,
        moonAlt: 0,
        crescent: 0,
        night: null,
        expanded: false,
        site: invitationSite,
      }),
    );
    await expect(target.page.locator('#loading')).toBeHidden();
    await target.page.evaluate(async () => {
      const w = window as unknown as { releaseShareLock: () => void };
      await new Promise<void>((entered) => {
        void navigator.locks.request(
          'npa:personal',
          () =>
            new Promise<void>((release) => {
              w.releaseShareLock = release;
              entered();
            }),
        );
      });
    });
    await target.page.locator('#shareAction').click();
    await expect(target.page.locator('#shareAction')).toBeDisabled();
    await target.page.locator('#shareDismiss').click();
    await target.page.evaluate(() =>
      (window as unknown as { releaseShareLock: () => void }).releaseShareLock(),
    );
    await expect.poll(async () => (await favorites(target.page)).sites.length).toBe(2);
    await expect(target.page.locator('#loading')).toBeHidden();
    await expect(target.page.locator('#sharedNotice')).toBeHidden();
  } finally {
    await target.context.close();
  }
});
