import { expect, test } from '@playwright/test';

test('River keyboard tasks include visible focus, minimap browsing and contained dialog keys', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#cv').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#riverSelection')).toContainText('Times in America/Los_Angeles.');
  expect(await page.locator('#cv').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    'solid',
  );
  await page.keyboard.press('Enter');
  await expect(page.locator('#cv')).toHaveAttribute('aria-expanded', 'true');
  const selected = await page.evaluate(() => window.__npa!.S.sel);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('scrollbar', { name: 'Browse River dates' })).toBeFocused();
  const before = await page.locator('#scroller').evaluate((el) => el.scrollTop);
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => page.locator('#scroller').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(before);
  await page.keyboard.press('Home');
  await expect.poll(() => page.locator('#scroller').evaluate((el) => el.scrollTop)).toBe(0);
  await page.keyboard.press('End');
  await expect
    .poll(() =>
      page.locator('#scroller').evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop),
    )
    .toBeLessThan(2);
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(selected);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#cv')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cv')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#siteSel').focus();
  await page.locator('#siteSel').selectOption('manage');
  await expect(page.getByRole('dialog', { name: 'Observing sites' })).toBeVisible();
  await page.locator('#siteDuplicate').focus();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(selected);
  await page.keyboard.press('Escape');
  await expect(page.locator('#siteSel')).toBeFocused();
});

for (const width of [320, 390]) {
  test(`shared controls fit and remain usable at ${width}px in every palette`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    for (const theme of ['light', 'dark', 'observing']) {
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const targets = await page
        .locator('#focusSeg button, #themeSel, #siteSel')
        .evaluateAll((nodes) =>
          nodes.map((el) => {
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height };
          }),
        );
      expect(targets.every((r) => r.width >= 24 && r.height >= 24)).toBe(true);
    }
    await page.locator('#siteSel').selectOption('manage');
    await expect(page.locator('#siteApply')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('forced colors and reduced motion retain visible chart focus and readable expanded facts', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Chromium provides forced-color emulation.');
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#cv').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#riverDetail')).toBeVisible();
  expect(await page.locator('#cv').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    'solid',
  );
  await expect(page.locator('#riverSelection')).toContainText('usable dark');
  await page.locator('#siteSel').selectOption('manage');
  await expect(page.getByLabel('Coordinates or full Google Maps link')).toBeVisible();
});
