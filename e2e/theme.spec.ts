import { chooseTheme, openAppMenu } from './header-controls';
import { expect, test } from '@playwright/test';

for (const width of [1512, 390]) {
  test(`themes preserve the expanded night and browsed position at ${width}px @retina`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await page.evaluate(() => {
      const app = window.__npa!;
      const i = app.nights.findIndex((n) => n.id === '2026-11-06');
      app.select(i, true, true);
      app.toggleRiverNight(i);
    });
    const state = () =>
      page.evaluate(() => ({
        selected: window.__npa!.S.sel,
        expanded: window.__npa!.S.riverExpanded,
        scroll: document.getElementById('scroller')!.scrollTop,
        duration: window.__npa!.nights[window.__npa!.S.sel].mfMs,
      }));
    const before = await state();
    for (const theme of ['dark', 'light', 'observing', 'system']) {
      await chooseTheme(page, theme);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? 'system'))
        .toBe(theme);
      await expect.poll(state).toEqual(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const background = await page
        .locator('#riverDetail')
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(background).toBe(
        theme === 'observing'
          ? 'rgb(19, 15, 17)'
          : theme === 'light' || (theme === 'system' && info.project.use.colorScheme !== 'dark')
            ? 'rgb(247, 248, 250)'
            : 'rgb(13, 17, 24)',
      );
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-theme-${theme}-${width}.png`,
        });
    }
    await chooseTheme(page, 'observing');
    const levels = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      return ['day', 'civil', 'naut', 'astro', 'dark'].map((stage) => {
        const hex = css.getPropertyValue('--sky-' + stage).trim();
        return parseInt(hex.slice(1, 3), 16);
      });
    });
    expect(levels.every((level, i) => i === 0 || levels[i - 1] > level)).toBe(true);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'observing');
    await page.reload();
    await expect(page.locator('#themeMenuLabel')).toHaveText('Theme');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'observing');
    await chooseTheme(page, 'system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect
      .poll(() => page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(7, 9, 14)');
  });
}

test('theme switching works when storage is unavailable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Storage unavailable');
    };
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable');
    };
  });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await chooseTheme(page, 'observing');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'observing');
  expect(errors).toEqual([]);
});

for (const width of [1512, 390, 320]) {
  test(`Theme has a stable label, one checkmark, and dismisses on selection at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width > 700 ? 920 : 844 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    for (const theme of ['System', 'Dark', 'Dark', 'Observing', 'Light', 'System']) {
      await openAppMenu(page);
      await expect(page.locator('#themeMenuLabel')).toHaveText('Theme');
      await expect(page.getByRole('menuitemradio')).toHaveCount(4);
      await expect(page.getByRole('menuitemradio', { checked: true })).toHaveCount(1);
      await page.getByRole('menuitemradio', { name: theme, exact: true }).click();
      await expect(page.locator('#appMenu')).toBeHidden();
      await expect(page.locator('#moreBtn')).toBeFocused();
      await openAppMenu(page);
      const current = page.getByRole('menuitemradio', { name: theme, exact: true });
      await expect(current).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('menuitemradio', { checked: true })).toHaveCount(1);
      await expect(current.locator('.theme-check')).toBeVisible();
      const popup = await page.locator('#appMenu').boundingBox();
      expect(popup!.x).toBeGreaterThanOrEqual(0);
      expect(popup!.x + popup!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (process.env.SCREENSHOTS && [1512, 390].includes(width))
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-theme-menu-${width}-${theme.toLowerCase()}.png`,
        });
      await page.keyboard.press('Escape');
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
    await openAppMenu(page);
    await expect(page.getByRole('menuitemradio', { name: 'System', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Escape');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'light');
  });
}

for (const width of [1512, 390]) {
  test(`Theme uses Bootstrap menu keys and preserves the chart at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    const night = await page.evaluate(() => window.__npa!.S.sel);
    const more = page.locator('#moreBtn');
    await more.focus();
    await more.press('Enter');
    await expect(page.locator('#shareSiteBtn')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#shareBtn')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#calendarExportBtn')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#browserDataOpen')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitemradio', { name: 'System', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    const light = page.getByRole('menuitemradio', { name: 'Light', exact: true });
    await expect(light).toBeFocused();
    await expect(page.getByRole('menuitemradio', { name: 'System', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Enter');
    await expect(page.locator('#appMenu')).toBeHidden();
    await expect(more).toBeFocused();
    await more.press('ArrowDown');
    await expect(page.locator('#shareSiteBtn')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#appMenu')).toBeHidden();
    await expect(more).toBeFocused();
    expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(night);
  });
}

test('Theme remains usable across phone resizing and in a short viewport', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await openAppMenu(page);
  const observing = page.getByRole('menuitemradio', { name: 'Observing', exact: true });
  await observing.focus();
  for (const width of [390, 1512]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(observing).toBeFocused();
    await expect(observing).toBeInViewport({ ratio: 1 });
  }
  await page.setViewportSize({ width: 390, height: 300 });
  await page.locator('#shareBtn').focus();
  for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowDown');
  await expect(observing).toBeFocused();
  await expect(observing).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('ArrowDown');
  await expect(observing).toBeFocused();
  await page.keyboard.press('Escape');
});
