import { seedPersonal } from './storage';
import { openGuide } from './header-controls';
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

// A fixed "now" (Sep 23, 2026, 8 PM in Seattle, the default site) keeps tonight and the
// loaded range the same on every run.
const NOW = new Date('2026-09-24T03:00:00Z');

const VIEWS = [
  { id: 'river', tab: 'River' },
  { id: 'calendar', tab: 'Calendar' },
  { id: 'lunations', tab: 'Lunations' },
  { id: 'notes', tab: 'How it works' },
] as const;

/** Open the site with the clock fixed; returns the page errors seen so far (and later). */
async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.clock.setFixedTime(NOW);
  await page.goto('./');
  await page.waitForFunction(() => (window.__npa?.nights.length ?? 0) > 0);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  return errors;
}

/** Distinct colors across a grid of canvas samples: a blank canvas has one. */
async function canvasColors(page: Page): Promise<number> {
  return page.evaluate(() => {
    const cv = document.getElementById('cv') as HTMLCanvasElement;
    const data = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
    const seen = new Set<number>();
    for (let y = 0; y < cv.height; y += 9)
      for (let x = 0; x < cv.width; x += 9) {
        const i = (y * cv.width + x) * 4;
        seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      }
    return seen.size;
  });
}

const insDate = (page: Page) => page.locator('#riverSelection');

for (const view of VIEWS) {
  test(`${view.tab} view renders`, async ({ page }, info) => {
    const errors = await open(page);
    if (view.id === 'notes') await openGuide(page);
    else await page.getByRole('button', { name: view.tab, exact: true }).click();
    await expect(page.locator('#viewTitle')).toHaveText(view.tab);
    if (view.id === 'notes') {
      await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
    } else {
      // Resize and view changes can schedule another frame, especially in WebKit.
      await expect.poll(() => canvasColors(page)).toBeGreaterThan(8);
    }
    await expect(insDate(page)).toContainText('Wed Sep 23 → Thu Sep 24');
    if (process.env.SCREENSHOTS) {
      await page.screenshot({
        path: path.join('test-results', 'screenshots', `${info.project.name}-${view.id}.png`),
      });
    }
    expect(errors).toEqual([]);
  });
}

test('keys, the weekend tray and Tonight move the selection', async ({ page }) => {
  const errors = await open(page);
  await page.keyboard.press('ArrowRight');
  await expect(insDate(page)).toContainText('Thu Sep 24 → Fri Sep 25');
  await page.keyboard.press('ArrowDown');
  await expect(insDate(page)).toContainText('Thu Oct 1 → Fri Oct 2');
  await page.locator('#riverWeekends > summary').click();
  await page.locator('#insWeekends button').first().click();
  await expect(insDate(page)).toContainText('Fri Oct 9 → Sat Oct 10');
  await expect(page.locator('#riverSelection')).toContainText('9h 24m usable dark');
  await page.getByRole('button', { name: 'Tonight' }).click();
  await expect(insDate(page)).toContainText('Wed Sep 23 → Thu Sep 24');
  expect(errors).toEqual([]);
});

test('clicking a night on the canvas selects it', async ({ page }) => {
  const errors = await open(page);
  // River, Month zoom: 30 px axis band, then 20 px rows; tonight opens as the fourth row, so the
  // eighth row down is four nights later.
  const box = (await page.locator('#cv').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 30 + 7 * 20 + 10);
  await expect(insDate(page)).toContainText('Sun Sep 27 → Mon Sep 28');
  expect(errors).toEqual([]);
});

test('a new site recomputes every night', async ({ page }) => {
  const errors = await open(page);
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#siteName').fill('Edinburgh');
  await page.locator('#siteLocation').fill('55.95, -3.19');
  await page.locator('#siteTz').fill('Europe/London');
  await page.locator('#siteApply').click();
  await expect(page.locator('#siteSel option:checked')).toHaveText('Edinburgh');
  await expect(page.locator('#siteSel')).toHaveAttribute('title', /55.95°N 3.19°W/);
  await expect(page.locator('#riverSelection')).toContainText('Wed Sep 23 → Thu Sep 24');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('an unknown time zone is refused with a message', async ({ page }) => {
  await open(page);
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#siteTz').fill('Mars/Olympus_Mons');
  await page.locator('#siteApply').click();
  await expect(page.locator('#siteTzErr')).toHaveText(
    'Enter a valid IANA time zone, such as America/Los_Angeles.',
  );
  await expect(page.locator('#siteTz')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#siteTz')).toBeFocused();
  await expect(page.locator('#siteSel option:checked')).toContainText('Seattle');
});

test('the page follows the system color scheme', async ({ page }, info) => {
  await open(page);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = info.project.use.colorScheme === 'dark';
  expect(bg).toBe(dark ? 'rgb(7, 9, 14)' : 'rgb(233, 237, 242)');
});

test('optional elevation persists, corrects events, and can be cleared without changing coordinates', async ({
  page,
}) => {
  // Allow time for four full range computations, including a reload, on slower machines.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  // Pin the sea-level baseline independently of the public starter site's elevation.
  await seedPersonal(page, {
    site: {
      name: 'Sea-level Seattle',
      lat: 47.60621,
      lon: -122.34253,
      tz: 'America/Los_Angeles',
    },
  });
  const errors = await open(page);
  const before = await page.evaluate(() => {
    const n = window.__npa!.nights.find((n) => n.id === '2026-10-03')!;
    return { sunset: n.ev.sunset!, sunrise: n.ev.sunrise!, moonRise: n.moonRise! };
  });
  await page.locator('#siteSel').selectOption('manage');
  await expect(page.getByLabel('Elevation (m above sea level, optional)')).toHaveValue('');
  await page.locator('#siteElevation').fill('2000');
  await page.locator('#siteApply').click();
  await expect(page.locator('#sitePop')).toBeHidden();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#siteSel')).toHaveAttribute('title', /2000 m/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const after = await page.evaluate(() => {
    const n = window.__npa!.nights.find((n) => n.id === '2026-10-03')!;
    return { sunset: n.ev.sunset!, sunrise: n.ev.sunrise!, moonRise: n.moonRise! };
  });
  expect(after.sunset).toBeLessThan(before.sunset);
  expect(after.sunrise).toBeGreaterThan(before.sunrise);
  expect(after.moonRise).toBeGreaterThan(before.moonRise);
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  await page.locator('#siteSel').selectOption('manage');
  await expect(page.locator('#siteElevation')).toHaveValue('2000');
  await expect(page.locator('#siteLocation')).toHaveValue('47.60621, -122.34253');
  await page.locator('#siteElevation').fill('');
  await page.locator('#siteApply').click();
  await expect(page.locator('#sitePop')).toBeHidden();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  expect(await page.evaluate(() => window.__npa!.S.site.elevation)).toBeUndefined();
  expect(
    await page.evaluate(() => window.__npa!.nights.find((n) => n.id === '2026-10-03')!.ev.sunset),
  ).toBe(before.sunset);
  expect(errors).toEqual([]);
});

test('elevation validates range, accepts below sea level, and can be cleared', async ({ page }) => {
  const errors = await open(page);
  const initialElevation = await page.evaluate(() => window.__npa!.S.site.elevation);
  await page.locator('#siteSel').selectOption('manage');
  for (const value of ['-501', '10001']) {
    await page.locator('#siteElevation').fill(value);
    await page.locator('#siteApply').click();
    await expect(page.locator('#siteElevationErr')).toHaveText(
      'Elevation must be between −500 and 10,000 metres above sea level, or left blank.',
    );
    await expect(page.locator('#siteElevation')).toHaveAttribute('aria-invalid', 'true');
    expect(await page.evaluate(() => window.__npa!.S.site.elevation)).toBe(initialElevation);
  }
  await page.locator('#siteElevation').fill('-400');
  await page.locator('#siteApply').click();
  await expect(page.locator('#sitePop')).toBeHidden();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#siteSel')).toHaveAttribute('title', /-400 m/);
  await page.locator('#siteSel').selectOption('manage');
  await page.locator('#siteElevation').fill('');
  await page.locator('#siteApply').click();
  await expect(page.locator('#sitePop')).toBeHidden();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
  expect(await page.evaluate(() => window.__npa!.S.site.elevation)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('saved sites without elevation retain their coordinates and use sea level', async ({
  page,
}) => {
  await seedPersonal(page, {
    site: { name: 'Sea-level site', lat: 55.95, lon: -3.19, tz: 'Europe/London' },
  });
  const errors = await open(page);
  await expect(page.locator('#siteSel option:checked')).toContainText('Sea-level site');
  await page.locator('#siteSel').selectOption('manage');
  await expect(page.locator('#siteElevation')).toHaveValue('');
  await expect(page.locator('#siteLocation')).toHaveValue('55.95, -3.19');
  expect(errors).toEqual([]);
});
