import { chooseTheme, openAppMenu } from './header-controls';
import { expect, test } from '@playwright/test';

for (const width of [1512, 390]) {
  test(`themes preserve the expanded night and browsed position at ${width}px`, async ({
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
    await expect(page.locator('#themeMenuLabel')).toHaveText('Theme · Observing');
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
  test(`Theme shows the current preference and one checkmark at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width > 700 ? 920 : 844 });
    await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await openAppMenu(page);
    await expect(page.locator('#themeMenuLabel')).toHaveText('Theme · System');
    await page.locator('#themeBtn').click();
    const menu = page.getByRole('menu', { name: 'Theme', exact: true });
    const system = menu.getByRole('menuitemradio', { name: 'System', exact: true });
    await expect(menu.getByRole('menuitemradio')).toHaveCount(4);
    await expect(system).toHaveAttribute('aria-checked', 'true');
    await expect(menu.getByRole('menuitemradio', { checked: true })).toHaveCount(1);
    const bounds = await page.evaluate(() => {
      const outer = document.getElementById('appMenu')!.getBoundingClientRect();
      const inner = document.getElementById('themeMenu')!.getBoundingClientRect();
      const trigger = document.getElementById('themeBtn')!.getBoundingClientRect();
      return {
        inline:
          inner.left >= outer.left &&
          inner.right <= outer.right &&
          inner.top >= trigger.bottom &&
          inner.bottom <= outer.bottom,
        flyout: inner.right <= outer.left || inner.left >= outer.right,
        fits:
          inner.left >= 0 &&
          inner.right <= innerWidth &&
          inner.top >= 0 &&
          inner.bottom <= innerHeight,
      };
    });
    expect(bounds.inline).toBe(width <= 700);
    expect(bounds.flyout).toBe(width > 700);
    expect(bounds.fits).toBe(true);
    for (const theme of ['System', 'Dark']) {
      await menu.getByRole('menuitemradio', { name: theme, exact: true }).click();
      await expect(page.locator('#themeMenuLabel')).toHaveText(`Theme · ${theme}`);
      await expect(menu.getByRole('menuitemradio', { checked: true })).toHaveCount(1);
      await expect(menu.getByRole('menuitemradio', { name: theme, exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (process.env.SCREENSHOTS) {
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-theme-menu-${width}-${theme.toLowerCase()}.png`,
        });
        const clip = await page.evaluate(() => {
          const rects = ['moreBtn', 'appMenu', 'themeMenu'].map((id) =>
            document.getElementById(id)!.getBoundingClientRect(),
          );
          const x = Math.max(0, Math.min(...rects.map((r) => r.left)) - 6);
          const y = Math.max(0, Math.min(...rects.map((r) => r.top)) - 6);
          return {
            x,
            y,
            width: Math.min(innerWidth, Math.max(...rects.map((r) => r.right)) + 6) - x,
            height: Math.min(innerHeight, Math.max(...rects.map((r) => r.bottom)) + 6) - y,
          };
        });
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-theme-menu-closeup-${width}-${theme.toLowerCase()}.png`,
          clip,
        });
      }
    }
    await system.click();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(system).toHaveAttribute('aria-checked', 'true');
    await expect(menu.getByRole('menuitemradio', { name: 'Dark', exact: true })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(page.locator('#themeMenuLabel')).toHaveText('Theme · System');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  });
}

for (const width of [1512, 390]) {
  test(`Theme keyboard navigation and Escape preserve the parent menu at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 920 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    const night = await page.evaluate(() => window.__npa!.S.sel);
    await openAppMenu(page);
    const trigger = page.locator('#themeBtn');
    await trigger.focus();
    await trigger.press('ArrowRight');
    const system = page.getByRole('menuitemradio', { name: 'System', exact: true });
    const light = page.getByRole('menuitemradio', { name: 'Light', exact: true });
    await expect(system).toBeFocused();
    await system.press('ArrowDown');
    await expect(light).toBeFocused();
    await expect(system).toHaveAttribute('aria-checked', 'true');
    await light.press('Enter');
    await expect(light).toHaveAttribute('aria-checked', 'true');
    await light.press('End');
    await expect(page.getByRole('menuitemradio', { name: 'Observing', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#themeMenu')).toBeHidden();
    await expect(page.locator('#appMenu')).toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.press('ArrowRight');
    await expect(light).toBeFocused();
    await light.press('Tab');
    await expect(page.locator('#themeMenu')).toBeHidden();
    await expect(page.locator('#guideBtn')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#appMenu')).toBeHidden();
    await expect(page.locator('#moreBtn')).toBeFocused();
    expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(night);
  });
}

test('Theme switches between flyout and inline layouts without losing keyboard focus', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await openAppMenu(page);
  await page.locator('#themeBtn').click();
  await expect(page.getByRole('menuitemradio', { name: 'System', exact: true })).toBeFocused();
  for (const width of [390, 1512]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('#themeMenu')).toBeHidden();
    await expect(page.locator('#themeBtn')).toBeFocused();
    await page.locator('#themeBtn').press('ArrowRight');
    await expect(page.getByRole('menuitemradio', { name: 'System', exact: true })).toBeFocused();
  }
});

test('keyboard focus reveals Theme choices and parent actions in a short phone popup', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 300 });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await openAppMenu(page);
  await page.locator('#themeBtn').press('ArrowRight');
  await page.keyboard.press('End');
  const observing = page.getByRole('menuitemradio', { name: 'Observing', exact: true });
  await expect(observing).toBeFocused();
  await expect(observing).toBeInViewport({ ratio: 1 });
  await observing.press('Tab');
  await expect(page.locator('#guideBtn')).toBeFocused();
  await expect(page.locator('#guideBtn')).toBeInViewport({ ratio: 1 });
});
