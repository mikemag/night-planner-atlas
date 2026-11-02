import { chooseTheme, openGuide } from './header-controls';
import { expect, test } from '@playwright/test';

for (const width of [1512, 390]) {
  test(`the guide explains the current model offline in every palette at ${width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await openGuide(page);
    await expect(page.getByRole('heading', { name: 'How it works', exact: true })).toBeVisible();
    await expect(page.locator('#inspector')).toBeHidden();
    await expect(page.locator('#planningControls')).toBeHidden();
    await expect(page.locator('.guide-table tbody tr')).toHaveCount(4);
    for (const theme of ['light', 'dark', 'observing']) {
      await chooseTheme(page, theme);
      const contrast = await page.locator('[data-sky-stage]').evaluateAll((nodes) => {
        const lum = (color: string) => {
          const [r, g, b] = color
            .match(/\d+/g)!
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const s = v / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        return nodes.map((node) => {
          const c = getComputedStyle(node);
          const a = lum(c.color),
            b = lum(c.backgroundColor);
          return { contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), lightness: b };
        });
      });
      expect(contrast.every((value) => value.contrast >= 4.5)).toBe(true);
      expect(
        contrast.every((value, i) => i === 0 || contrast[i - 1].lightness > value.lightness),
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-guide-${theme}-${width}.png`,
        });
    }
    await page
      .getByText('Why rise/set events and altitude curves use different points', { exact: true })
      .click();
    await expect(
      page.getByRole('img', { name: 'The Moon’s upper edge and center are different' }),
    ).toBeVisible();
    await context.setOffline(true);
    await page.getByRole('link', { name: 'Accuracy', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Accuracy, with the comparisons attached' }),
    ).toBeInViewport();
    await page
      .getByText('Search windows, numerical tolerances and reference provenance', { exact: true })
      .click();
    await expect(page.locator('#referenceQueries a')).toHaveCount(15);
    await expect(page.locator('#referenceFixture')).toHaveAttribute('href', /^blob:/);
    await page.getByRole('link', { name: 'Privacy and credits', exact: true }).click();
    await page
      .getByText('Read the time-zone code and ODbL data notices offline', { exact: true })
      .click();
    await expect(page.locator('#timezoneNotices')).toContainText('Open Database License');
    await expect(page.locator('#astronomyNotices')).toContainText(
      'Copyright (c) 2019-2023 Don Cross',
    );
    const example = await page.evaluate(() => {
      const n = window.__npa!.nights.find((n) => n.id === '2026-10-09')!;
      return Math.round(n.mfMs / 60000);
    });
    expect(example).toBe(9 * 60 + 24);
    expect(
      await page.locator('#notesView').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  });
}
