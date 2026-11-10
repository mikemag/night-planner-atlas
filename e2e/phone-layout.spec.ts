import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

test('phone views and expanded nights stay inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-10T02:30:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  for (const view of ['river', 'lunations', 'calendar', 'weekends']) {
    await page.locator(`#viewSeg button[data-view="${view}"]`).click();
    if (view !== 'weekends') {
      await page.locator('#cv').press('Enter');
      await expect(page.locator(`#${view}Detail`)).toBeVisible();
    } else {
      await page.locator('.trip-compare > summary').first().click();
      await page.locator('.trip-candidate > summary').first().click();
    }
    const geometry = await page.evaluate((view) => {
      const panel = document.getElementById(view === 'weekends' ? 'tripScroll' : 'scroller')!;
      const bounds = panel.getBoundingClientRect();
      return {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        panelBottom: bounds.bottom,
        panelHeight: bounds.height,
        scrolls: panel.scrollHeight > panel.clientHeight,
      };
    }, view);
    expect(geometry.width).toBe(390);
    expect(geometry.height).toBe(844);
    expect(geometry.panelBottom).toBeLessThan(844);
    expect(geometry.panelHeight).toBeGreaterThan(300);
    expect(geometry.scrolls).toBe(true);
  }
});
