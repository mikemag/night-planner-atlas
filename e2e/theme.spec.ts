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
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
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
    await page.getByLabel('Theme', { exact: true }).selectOption('observing');
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
    await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('observing');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'observing');
    await page.getByLabel('Theme', { exact: true }).selectOption('system');
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
  await page.getByLabel('Theme', { exact: true }).selectOption('observing');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'observing');
  expect(errors).toEqual([]);
});
