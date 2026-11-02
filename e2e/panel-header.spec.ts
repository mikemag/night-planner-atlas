import { expect, test, type Page } from '@playwright/test';
import { chooseTheme } from './header-controls';

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: width > 700 ? 900 : 844 });
  await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
}

async function painted(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

for (const width of [1512, 1100, 800, 390, 320]) {
  test(`panel controls align and keep the key compact at ${width}px`, async ({ page }, info) => {
    await open(page, width);
    let riverControls: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const view of ['River', 'Lunations', 'Calendar']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      const header = page.locator('.stage-head');
      await expect(header.getByRole('heading', { name: view, exact: true })).toHaveCount(1);
      await expect(page.locator('#viewSub, #riverMoonKey')).toHaveCount(0);
      await expect(page.locator('#periodLabel')).toBeVisible();
      if (view === 'Lunations') await expect(page.locator('#viewCtl')).toBeHidden();
      else {
        const controls = await page.evaluate(() => {
          const header = document.querySelector('.stage-head')!.getBoundingClientRect();
          return [...document.querySelectorAll('#viewCtl button')].slice(0, 2).map((button) => {
            const b = button.getBoundingClientRect();
            return { x: b.x - header.x, y: b.y - header.y, width: b.width, height: b.height };
          });
        });
        if (view === 'River') riverControls = controls;
        else {
          for (let i = 0; i < controls.length; i++)
            for (const key of ['x', 'y', 'width', 'height'] as const)
              expect(Math.abs(controls[i][key] - riverControls[i][key])).toBeLessThanOrEqual(1);
        }
      }
      if (view === 'Calendar') {
        for (const zoom of ['Year', 'Month', 'Week']) {
          await page.locator('#viewCtl').getByRole('button', { name: zoom, exact: true }).click();
          if (zoom === 'Week') await expect(page.locator('#legendBtn')).toBeVisible();
          else await expect(page.locator('#panelKey')).toBeHidden();
        }
      }
      await expect(page.locator('#legendBtn')).toBeVisible();
      if (width > 1100) await expect(page.locator('#legend')).toBeVisible();
      else await expect(page.locator('#legend')).toBeHidden();
      expect((await header.boundingBox())!.height).toBeLessThanOrEqual(width <= 700 ? 82 : 48);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (process.env.SCREENSHOTS && [1512, 390].includes(width)) {
        await painted(page);
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-panel-${width}-${view.toLowerCase()}.png`,
        });
      }
    }
  });
}

for (const width of [1512, 390]) {
  test(`Legend supports keyboard dismissal without changing the chart at ${width}px`, async ({
    page,
  }) => {
    await open(page, width);
    await page.locator('#cv').focus();
    await page.keyboard.press('Enter');
    const state = () =>
      page.evaluate(() => ({
        selected: window.__npa!.S.sel,
        expanded: window.__npa!.S.riverExpanded,
        scroll: document.getElementById('scroller')!.scrollTop,
        height: document.getElementById('scroller')!.clientHeight,
      }));
    const before = await state();
    const trigger = page.getByRole('button', { name: 'Legend', exact: true });
    await trigger.focus();
    await trigger.press('Enter');
    const popup = page.getByRole('dialog', { name: 'Chart legend', exact: true });
    await expect(popup).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(popup.locator('#legend')).toBeVisible();
    await expect(popup).toContainText('Brighter means fuller.');
    await expect(popup).not.toContainText('New moon');
    await expect(page.locator('#acceptedMoonKey')).toBeHidden();
    for (const key of ['ArrowDown', 'ArrowRight', 't', '2']) await page.keyboard.press(key);
    await expect.poll(state).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#panelKey > #legend')).toHaveCount(1);
    await expect(page.locator('#cv')).toHaveAttribute('aria-expanded', 'true');
    await trigger.click();
    await popup.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('heading', { name: 'Night Planner Atlas', exact: true }).click();
    await expect(popup).toBeHidden();
    await expect.poll(state).toEqual(before);
  });
}

test('the key follows planning settings and themes while resizing safely', async ({
  page,
}, info) => {
  await open(page, 1512);
  const key = page.locator('#legend');
  await expect(page.locator('#acceptedMoonKey')).toBeHidden();
  await page.locator('#moonAltSel').selectOption('10');
  await expect(page.locator('#acceptedMoonKey')).toBeVisible();
  await chooseTheme(page, 'observing');
  const gradient = await page.locator('#acceptedMoonSw').evaluate((el) => el.style.background);
  expect(gradient).toContain('linear-gradient');
  await page.locator('#legendBtn').click();
  const popup = page.locator('#legendPopover');
  await expect(popup.locator('#acceptedMoonKey')).toBeVisible();
  expect(await page.locator('#acceptedMoonSw').evaluate((el) => el.style.background)).toBe(
    gradient,
  );
  await page.setViewportSize({ width: 390, height: 667 });
  await expect
    .poll(async () => {
      const b = (await popup.boundingBox())!;
      return b.x >= 0 && b.y >= 0 && b.x + b.width <= 390 && b.y + b.height <= 667;
    })
    .toBe(true);
  await page.locator('#legendClose').click();
  await expect(page.locator('#legendBtn')).toBeFocused();
  await expect(key).toBeHidden();
  await page.setViewportSize({ width: 1512, height: 900 });
  await expect(key).toBeVisible();
  await page.locator('#moonAltSel').selectOption('0');
  await expect(page.locator('#acceptedMoonKey')).toBeHidden();
  await page.locator('#crescentSel').selectOption('0.2');
  await expect(page.locator('#acceptedMoonKey')).toBeVisible();
  if (process.env.SCREENSHOTS)
    for (const width of [1512, 390]) {
      await page.setViewportSize({ width, height: width > 700 ? 900 : 844 });
      for (const view of ['River', 'Lunations', 'Calendar']) {
        await page.getByRole('button', { name: view, exact: true }).click();
        if (view === 'Calendar')
          await page.locator('#viewCtl').getByRole('button', { name: 'Week', exact: true }).click();
        await painted(page);
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-panel-observing-${width}-${view.toLowerCase()}.png`,
        });
      }
    }
});
