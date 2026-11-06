import { expect, test } from '@playwright/test';
import { openAppMenu, openGuide } from './header-controls';

for (const width of [1512, 1100, 800, 390, 320]) {
  test(`shared header keeps its hierarchy and controls across views at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width > 700 ? 920 : 844 });
    await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#viewSeg button[aria-pressed="true"]')).toHaveText('River');
    await expect(page.locator('#viewSeg button')).toHaveText([
      'River',
      'Lunations',
      'Calendar',
      'Dark Weekends',
    ]);
    await expect(page.locator('#prevBtn, #nextBtn')).toHaveCount(0);
    await expect(page.locator('#siteSel option:checked')).not.toContainText('°');
    await expect(page.locator('#siteClockTime')).toContainText('Oct 28, 3:00 PM PDT');

    for (const view of ['river', 'lunations', 'calendar', 'weekends', 'notes']) {
      const trigger = view === 'notes' ? '#docsLink' : `#viewSeg button[data-view="${view}"]`;
      if (view === 'notes') await openGuide(page);
      else await page.locator(trigger).click();
      if (view !== 'notes') {
        await expect(page.locator(trigger)).toHaveAttribute('aria-pressed', 'true');
        for (const id of ['siteSel', 'siteClockTime', 'viewSeg', 'moreBtn'])
          await expect(page.locator(`#${id}`)).toBeVisible();
      }
      await expect(page.locator('#appMenu')).toBeHidden();
      if (view === 'notes') {
        await expect(page.locator('#siteSel, #viewSeg, #planningControls').first()).toBeHidden();
        await expect(page.locator('#docsBack')).toBeVisible();
        await expect(page.locator('#docsIdentity')).toBeVisible();
      } else {
        for (const id of ['rangeCtl', 'todayBtn'])
          await expect(page.locator(`#${id}`)).toBeVisible();
        if (view === 'weekends') {
          await expect(page.locator('#focusSeg')).toBeHidden();
          await expect(page.locator('#darkWeekends')).toBeVisible();
        } else {
          await expect(page.locator('#focusSeg')).toBeVisible();
          await expect(page.locator('.stage-head #periodLabel')).toBeVisible();
        }
        if (width <= 700) {
          await expect(page.locator('#moonSettingsSummary')).toBeVisible();
          await expect(page.locator('#moonAltSel')).toBeHidden();
        } else {
          await expect(page.locator('#moonSettingsSummary')).toBeHidden();
          await expect(page.locator('#moonAltSel')).toBeVisible();
        }
        if (width === 1512 && view !== 'weekends') {
          const singleBand = await page.evaluate(() => {
            const site = document.querySelector('.brand')!.getBoundingClientRect();
            return ['viewSeg', 'rangeCtl', 'focusSeg', 'moonSettings'].every((id) => {
              const r = document.getElementById(id)!.getBoundingClientRect();
              return r.top >= site.top - 1 && r.bottom <= site.bottom + 1;
            });
          });
          expect(singleBand).toBe(true);
          const alignment = await page.evaluate(() => {
            const controls = [
              'siteSel',
              'viewSeg',
              'rangePrev',
              'todayBtn',
              'focusSeg',
              'moonAltSel',
              'crescentSel',
              'moreBtn',
            ].map((id) => document.getElementById(id)!.getBoundingClientRect());
            return {
              topSpread:
                Math.max(...controls.map((r) => r.top)) - Math.min(...controls.map((r) => r.top)),
              heightSpread:
                Math.max(...controls.map((r) => r.height)) -
                Math.min(...controls.map((r) => r.height)),
            };
          });
          expect(alignment.topSpread).toBeLessThanOrEqual(1);
          expect(alignment.heightSpread).toBeLessThanOrEqual(1);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      if (process.env.SCREENSHOTS && width !== 320) {
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-header-${width}-${view}.png`,
        });
        if (view !== 'notes')
          await page.locator('#viewSeg').screenshot({
            path: `test-results/screenshots/${info.project.name}-view-switcher-${width}-${view}.png`,
          });
      }
    }
  });
}

test('phone Moon settings support keyboard editing, view changes and responsive focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const summary = page.locator('#moonSettingsSummary');
  await summary.focus();
  await summary.press('Enter');
  await expect(page.locator('#moonAltSel')).toBeVisible();
  await page.locator('#moonAltSel').selectOption('10');
  await page.locator('#crescentSel').selectOption('0.2');
  await expect(summary).toHaveText('Moonlight: edge 10° · ignore under 20% lit');
  await page.getByRole('button', { name: 'Lunations', exact: true }).click();
  await expect(page.locator('#moonAltSel')).toBeVisible();
  await summary.focus();
  await summary.press('Space');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('#moonAltSel')).toBeHidden();
  await expect(summary).toHaveText('Moonlight: edge 10° · ignore under 20% lit');
  const selected = await page.evaluate(() => window.__npa!.S.sel);
  await summary.focus();
  await page.setViewportSize({ width: 1512, height: 920 });
  await expect(page.locator('#moonAltSel')).toBeFocused();
  await expect(page.locator('#moonAltSel')).toHaveValue('10');
  await expect(page.locator('#crescentSel')).toHaveValue('0.2');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(summary).toBeFocused();
  await expect(page.locator('#moonAltSel')).toBeHidden();
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(selected);
});

test('view shortcuts follow the switcher and Tonight restores the current range in every view', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const range = await page.locator('#rangeLabel').textContent();
  for (const [index, view] of ['river', 'lunations', 'calendar', 'notes', 'weekends'].entries()) {
    await page.locator('#moreBtn').focus();
    await page.keyboard.press(String(index + 1));
    if (view === 'notes') {
      await expect(page.locator('#notesView')).toBeVisible();
      continue;
    }
    expect(await page.evaluate(() => window.__npa!.S.view)).toBe(view);
    await page.locator('#rangeNext').click();
    await expect(page.locator('#loading')).toBeHidden();
    expect(await page.evaluate(() => window.__npa!.nights.some((n) => n.id === '2026-10-28'))).toBe(
      false,
    );
    await page.getByRole('button', { name: 'Tonight', exact: true }).click();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#rangeLabel')).toHaveText(range!);
    expect(await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id)).toBe(
      '2026-10-28',
    );
  }
});

test('More options supports keyboard dismissal and does not pass keys through to the chart', async ({
  page,
}, info) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#cv').focus();
  await page.keyboard.press('Enter');
  const selected = await page.evaluate(() => window.__npa!.S.sel);
  const more = page.getByRole('button', { name: 'More options', exact: true });
  await more.focus();
  await more.press('Enter');
  await expect(page.getByRole('menu', { name: 'Planner options', exact: true })).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#shareBtn')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(selected);
  await page.keyboard.press('Escape');
  await expect(page.locator('#appMenu')).toBeHidden();
  await expect(more).toBeFocused();
  await expect(page.locator('#cv')).toHaveAttribute('aria-expanded', 'true');
  await openAppMenu(page);
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-header-menu.png`,
    });
  await page.getByRole('heading', { name: 'Night Planner Atlas', exact: true }).click();
  await expect(page.locator('#appMenu')).toBeHidden();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
});
