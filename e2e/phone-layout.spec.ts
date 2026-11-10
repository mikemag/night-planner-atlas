import { expect, test } from '@playwright/test';
import { chooseTheme, closePlanning, openPlanning } from './header-controls';
import { seedPersonal } from './storage';
import { DEFAULT_SITES } from '../src/app/default-sites';

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

for (const [width, height] of [
  [390, 844],
  [320, 568],
  [844, 390],
  [667, 375],
  [568, 320],
  [932, 430],
]) {
  test(`phone header leaves room for every view at ${width}×${height} @retina`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await seedPersonal(page, {
      site: {
        ...DEFAULT_SITES[0],
        name: 'A very long observing-site name beside the northern trail and telescope field',
      },
    });
    await page.clock.setFixedTime(new Date('2026-11-10T02:30:00Z'));
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    for (const theme of ['light', 'dark', 'observing']) {
      await chooseTheme(page, theme);
      for (const view of ['river', 'lunations', 'calendar', 'weekends']) {
        await page.locator(`#viewSeg button[data-view="${view}"]`).click();
        await expect(page.locator('#planSettingsBtn')).toBeVisible();
        await expect(page.locator('#todayBtn')).toBeInViewport();
        await expect(page.locator('#planningControls')).toBeHidden();
        const geometry = await page.evaluate((view) => {
          const bounds = document
            .getElementById(view === 'weekends' ? 'tripScroll' : 'scroller')!
            .getBoundingClientRect();
          return {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
            header: document.querySelector('.topbar')!.getBoundingClientRect().height,
            panel: bounds.height,
            bottom: bounds.bottom,
          };
        }, view);
        expect(geometry.width).toBe(width);
        expect(geometry.height).toBe(height);
        expect(geometry.header).toBeLessThanOrEqual(width > height ? 124 : 230);
        expect(geometry.panel).toBeGreaterThanOrEqual(width > height ? 80 : 150);
        expect(geometry.bottom).toBeLessThan(height);
        if (process.env.SCREENSHOTS)
          await page.screenshot({
            path: `test-results/screenshots/${info.project.name}-phone-${width}x${height}-${view}-${theme}.png`,
            animations: 'disabled',
          });
      }
    }
  });
}

test('phone planning dialog keeps its controls usable through rotation and nested range editing', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.setFixedTime(new Date('2026-11-10T02:30:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await openPlanning(page);
  const dialog = page.getByRole('dialog', { name: 'Plan settings', exact: true });
  await expect(page.locator('#rangePicker')).toBeFocused();
  await page.locator('#rangePicker').click();
  await expect(page.locator('#rangeMenu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#rangeMenu')).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(page.locator('#rangePicker')).toBeFocused();
  await page.locator('#rangePicker').click();
  await page.locator('#rangeYear').fill('2028');
  await page.setViewportSize({ width: 568, height: 320 });
  await expect(page.locator('#rangeYear')).toBeFocused();
  await page.getByRole('button', { name: 'Show year', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#planRangeLabel')).toHaveText('Jan – Dec 2028');
  await page.locator('#moonAltSel').selectOption('15');
  await page.locator('#crescentSel').selectOption('0.3');
  await page.locator('#crescentSel').focus();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  const bounds = (await dialog.locator('.modal-content').boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(568);
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-phone-plan-landscape.png`,
      animations: 'disabled',
    });
  await closePlanning(page);
  await expect(page.locator('#planSettingsBtn')).toBeFocused();
  await page.getByRole('button', { name: 'Tonight', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#planRangeLabel')).toHaveText('Oct 2026 – Nov 2027');
  await openPlanning(page);
  await expect(page.locator('#moonAltSel')).toHaveValue('15');
  await expect(page.locator('#crescentSel')).toHaveValue('0.3');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('rotating an expanded night preserves the selection and browsed rows without recomputing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-10T02:30:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const anchor = () =>
    page.evaluate(() => {
      const a = window.__npa!;
      const scroll = document.getElementById('scroller')!.scrollTop;
      if (a.S.view === 'river') {
        const i = Array.from(a.riverRows.tops).filter((y) => y <= scroll).length - 1;
        return a.nights[i]?.id;
      }
      if (a.S.view === 'lunations') {
        const k = a.lunationRows.tops.filter((y) => y <= scroll).length - 1;
        return a.lunationRows.cycles[k]?.t;
      }
      const block = a.calendarRows.blocks.filter((b) => b.y <= scroll).at(-1);
      return block?.t === 'week' ? block.key : block?.mo.key;
    });
  for (const view of ['river', 'lunations', 'calendar']) {
    await page.locator(`#viewSeg button[data-view="${view}"]`).click();
    await page.evaluate(() => {
      const a = window.__npa!;
      a.select(
        a.nights.findIndex((n) => n.id === '2026-12-10'),
        true,
        true,
      );
    });
    await page.locator('#cv').press('Enter');
    const before = await anchor();
    const calculated = await page.evaluate(() => window.__npa!.calculatedNights);
    for (const viewport of [
      { width: 844, height: 390 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.locator(`#${view}Detail`)).toBeVisible();
      await expect.poll(anchor).toBe(before);
      expect(await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id)).toBe(
        '2026-12-10',
      );
      expect(await page.evaluate(() => window.__npa!.calculatedNights)).toBe(calculated);
    }
  }
});
