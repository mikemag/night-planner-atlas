import { chooseFocus, chooseMoon } from './header-controls';
import { expect, test } from '@playwright/test';

test('a delayed stylesheet supplies valid colors before the first chart draw @dark', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
  await page.addInitScript(() => {
    const add = CanvasGradient.prototype.addColorStop;
    CanvasGradient.prototype.addColorStop = function (offset, color) {
      if (!CSS.supports('color', color)) document.documentElement.dataset.invalidGradient = color;
      return add.call(this, offset, color);
    };
  });
  // Vite emits the module before its stylesheet. Hold CSS long enough for a fast module
  // response to reach startup, reproducing a cold CDN load in WebKit.
  await page.route('**/*.css', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-invalid-gradient');
  await expect(page.locator('#riverSelection')).toContainText('Wed Oct 28');
  await page.locator('#cv').press('Enter');
  await expect(page.locator('#riverDetail')).toBeVisible();
});

test('controls changed during loading apply to the completed range', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__npa);
  await expect(page.locator('#loading')).toBeVisible();
  await chooseMoon(page, 'moonAltSel', '15');
  await chooseMoon(page, 'crescentSel', '0.3');
  await chooseFocus(page, 3);
  await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(() => {
    const app = window.__npa!;
    return {
      moonAlt: app.S.moonAlt,
      crescent: app.S.crescent,
      ignored: app.nights
        .filter((night) => night.illum < 0.3)
        .every((night) => night.moonIgnored && night.mfMs === night.tdMs),
      totals: app.lunations.every((cycle) => {
        const expected = app.nights
          .slice(Math.max(0, cycle.i - 3), Math.max(0, cycle.i + 4))
          .reduce((sum, night) => sum + night.mfMs, 0);
        return Math.abs(cycle.total - expected) < 1;
      }),
    };
  });
  expect(result).toEqual({ moonAlt: 15, crescent: 0.3, ignored: true, totals: true });
});
