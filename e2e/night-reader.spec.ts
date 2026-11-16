import { expect, test } from '@playwright/test';
import {
  chooseTheme,
  openAppMenu,
  openPlanning,
  closePlanning,
  chooseMoon,
} from './header-controls';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-07T01:00:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
});

for (const width of [1500, 390]) {
  test(`Read night supports native date navigation and restores focus at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const view of ['River', 'Calendar', 'Lunations', 'Dark Weekends']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      await openAppMenu(page);
      await page.getByRole('menuitem', { name: 'Read night…', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Read night', exact: true });
      await expect(dialog).toBeVisible();
      await expect(page.locator('#nightReaderTitle')).toBeFocused();
      await expect(
        dialog.getByRole('heading', { name: 'Moon at local midnight', level: 3, exact: true }),
      ).toBeVisible();
      await expect(dialog).toContainText('America/Los_Angeles');
      await page.getByLabel('Evening date', { exact: true }).fill('2026-09-06');
      await page.getByRole('button', { name: 'Go to night', exact: true }).click();
      await expect(page.locator('#nightReaderStatus')).toHaveText(
        'Sunday, September 6, 2026. 4h 30m usable dark.',
      );
      await expect(page.locator('#nightReaderFacts')).toContainText(
        /Sep 6(?:,| at) 9:29 PM to Sep 7(?:,| at) 1:59 AM \(4h 30m elapsed\)/,
      );
      await page.getByRole('button', { name: 'Next night', exact: true }).press('Enter');
      await expect(page.getByRole('button', { name: 'Next night', exact: true })).toBeFocused();
      await expect(page.locator('#nightReaderStatus')).toContainText('Monday, September 7, 2026.');
      await expect
        .poll(() => page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id))
        .toBe('2026-09-07');
      await page.getByRole('button', { name: 'Previous night', exact: true }).press('Enter');
      await expect(page.locator('#nightReaderStatus')).toContainText('Sunday, September 6, 2026.');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(page.locator('#moreBtn')).toBeFocused();
      await expect(page.locator('#riverSelection')).toHaveAttribute('aria-live', 'polite');
    }
    for (const theme of ['light', 'dark', 'observing']) {
      await chooseTheme(page, theme);
      await openAppMenu(page);
      await page.getByRole('menuitem', { name: 'Read night…', exact: true }).click();
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-reader-${width}-${theme}.png`,
        });
      await page.keyboard.press('Escape');
    }
  });
}

test('Read night distinguishes split windows, clock changes, missing events and range edges', async ({
  page,
}) => {
  await openPlanning(page);
  await page.locator('#rangePicker').click();
  await page.locator('#rangeYear').fill('2026');
  await page.locator('#rangeYearForm').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await closePlanning(page);
  await expect(page.locator('#loading')).toBeHidden();
  await chooseMoon(page, 'moonAltSel', '15');
  await openAppMenu(page);
  await page.getByRole('menuitem', { name: 'Read night…', exact: true }).click();
  const choose = async (date: string) => {
    await page.locator('#nightReaderDate').fill(date);
    await page.getByRole('button', { name: 'Go to night', exact: true }).click();
  };
  await choose('2026-06-29');
  await expect(page.locator('#nightReaderFacts')).toContainText(
    /Jun 30(?:,| at) 12:17 AM to Jun 30(?:,| at) 1:21 AM/,
  );
  await expect(page.locator('#nightReaderFacts')).toContainText(
    /Jun 30(?:,| at) 1:46 AM to Jun 30(?:,| at) 2:09 AM/,
  );
  await choose('2026-10-31');
  await expect(page.locator('#nightReaderFacts')).toContainText('Clock change');
  await expect(page.locator('#nightReaderFacts')).toContainText('GMT-7');
  await expect(page.locator('#nightReaderFacts')).toContainText('GMT-8');
  await choose('2026-01-01');
  await expect(page.locator('#nightReaderPrevious')).toBeDisabled();
  await choose('2026-12-30');
  await page.locator('#nightReaderNext').press('Enter');
  await expect(page.locator('#nightReaderNext')).toBeDisabled();
  await expect(page.locator('#nightReaderNext')).toBeFocused();
  await expect(page.locator('#nightReaderDate')).toHaveValue('2026-12-31');
  await page.keyboard.press('Escape');
  await page.locator('#siteSel').selectOption('site:svalbard-kjell-henriksen-observatory');
  await expect(page.locator('#loading')).toBeHidden();
  await openAppMenu(page);
  await page.getByRole('menuitem', { name: 'Read night…', exact: true }).click();
  await choose('2026-06-21');
  await expect(page.locator('#nightReaderFacts')).toContainText('No astronomical darkness');
  await expect(page.locator('#nightReaderFacts')).toContainText(
    'No crossing during this observing night.',
  );
});

test('chart shortcuts require chart focus and assistive activation opens the selected night', async ({
  page,
}) => {
  const selected = await page.evaluate(() => window.__npa!.S.sel);
  await page.locator('#todayBtn').focus();
  for (const key of ['ArrowRight', 'ArrowDown', '2', '3', '4', '5', 't'])
    await page.keyboard.press(key);
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(selected);
  await expect(page.locator('#viewTitle')).toHaveText('River');
  for (const view of ['River', 'Calendar', 'Lunations']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await page.locator('#cv').evaluate((el) => (el as HTMLElement).click());
    await expect(page.locator('#cv')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#cv').press('Escape');
    await expect(page.locator('#cv')).toHaveAttribute('aria-expanded', 'false');
  }
  await page.locator('#cv').press('3');
  await expect(page.locator('#viewTitle')).toHaveText('Calendar');
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await expect(page.locator('#cv')).toHaveAttribute('role', 'button');
  await page.locator('#cv').evaluate((el) => (el as HTMLElement).click());
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('link', { name: 'Docs', exact: true }).click();
  await page.keyboard.press('1');
  await expect(page.getByRole('heading', { name: 'Find good nights', exact: true })).toBeVisible();
});

test('focus shortcuts stay visible after scrolling and live summaries ignore pointer previews', async ({
  page,
}) => {
  await page.locator('#skipChart').focus();
  await expect(page.locator('#skipChart')).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Enter');
  await expect(page.locator('#cv')).toBeFocused();
  const status = await page.locator('#riverSelection').textContent();
  const box = (await page.locator('#cv').boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 140);
  await page.mouse.move(box.x + 200, box.y + 200);
  await expect(page.locator('#riverSelection')).toHaveText(status!);
  await page.locator('#riverMinimap').focus();
  await page.keyboard.press('End');
  await page.locator('#readNight').focus();
  await expect(page.locator('#readNight')).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Read night', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#readNight')).toBeFocused();
  await expect(page.locator('#readNight')).toBeInViewport({ ratio: 1 });
});

for (const width of [640, 320]) {
  test(`night facts reflow at ${width}px with reduced motion and forced colors`, async ({
    page,
    browserName,
  }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 225 : 450 });
    await page.emulateMedia({
      reducedMotion: 'reduce',
      ...(browserName === 'chromium' ? { forcedColors: 'active' as const } : {}),
    });
    await openAppMenu(page);
    await page.getByRole('menuitem', { name: 'Read night…', exact: true }).click();
    await expect(page.locator('#nightReaderTitle')).toBeFocused();
    await expect(page.locator('#nightReaderDone')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const body = page.locator('#nightReader .modal-body');
    expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('#nightReaderNext').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#nightReaderStatus')).toContainText('Monday, September 7, 2026.');
    await expect(page.locator('#nightReaderNext')).toBeInViewport({ ratio: 1 });
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-reader-reflow-${width}.png`,
      });
    await page.keyboard.press('Escape');
    await expect(page.locator('#moreBtn')).toBeFocused();
  });
}

test('chart labels and boundaries under color-vision simulations', async ({ page }, info) => {
  test.skip(
    !process.env.SCREENSHOTS || info.project.name !== 'chromium-light',
    'Visual audit captures.',
  );
  const session = await page.context().newCDPSession(page);
  for (const theme of ['light', 'dark']) {
    await chooseTheme(page, theme);
    for (const view of ['River', 'Calendar', 'Lunations']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      await page.locator('#cv').focus();
      await page.keyboard.press('Enter');
      for (const type of ['achromatopsia', 'deuteranopia', 'protanopia', 'tritanopia'] as const) {
        await session.send('Emulation.setEmulatedVisionDeficiency', { type });
        await page.screenshot({
          path: `test-results/screenshots/vision-${theme}-${view.toLowerCase()}-${type}.png`,
        });
      }
      await page.keyboard.press('Escape');
    }
  }
  await session.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
});
