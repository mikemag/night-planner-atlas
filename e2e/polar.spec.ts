import { expect, test } from '@playwright/test';

for (const width of [1512, 390]) {
  test(`polar daylight and winter twilight remain readable in every view at ${width}px`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.clock.setFixedTime(new Date('2026-12-21T12:00:00Z'));
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('#siteSel').selectOption('site:svalbard-kjell-henriksen-observatory');
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('#focusSeg button[data-val="0"]').click();
    expect(await page.evaluate(() => window.__npa!.ax)).toEqual({ start: 0, end: 24 });
    for (const id of ['2026-12-21', '2027-06-21']) {
      for (const view of ['river', 'calendar', 'lunations'] as const) {
        await page.evaluate(
          ({ id, view }) => {
            const app = window.__npa!;
            app.S.riverExpanded = false;
            app.S.calendarExpanded = false;
            app.S.lunationsExpanded = false;
            app.setView(view);
            const i = app.nights.findIndex((night) => night.id === id);
            app.select(i, true, true);
            if (view === 'river') app.toggleRiverNight(i);
            else if (view === 'calendar') app.toggleCalendarNight(i);
            else app.toggleLunationsNight(i);
          },
          { id, view },
        );
        const panel = page.locator(
          view === 'river'
            ? '#riverDetail'
            : view === 'calendar'
              ? '#calendarDetail'
              : '#lunationsDetail',
        );
        await expect(panel).toBeVisible();
        await expect(panel).toContainText(
          id.includes('12-21') ? 'Sun below horizon throughout' : 'Sun above horizon throughout',
        );
        if (id.includes('06-21')) await expect(panel).toContainText('No astronomical darkness');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        if (process.env.SCREENSHOTS)
          await page.screenshot({
            path: `test-results/screenshots/${info.project.name}-polar-${view}-${id}-${width}.png`,
          });
      }
    }
    await page.evaluate(() => {
      const app = window.__npa!;
      app.setView('calendar');
      app.setOpt('calZoom', 'week');
      app.select(
        app.nights.findIndex((night) => night.id === '2026-12-21'),
        true,
        true,
      );
    });
    const axes = await page.evaluate(() =>
      window.__npa!.calendarRows.blocks.flatMap((block) =>
        block.t === 'week' && block.wk.some((i) => window.__npa!.nights[i]?.id === '2026-12-21')
          ? [block.axis]
          : [],
      ),
    );
    expect(axes.length).toBeGreaterThan(0);
    expect(axes.every((axis) => axis?.start === 0 && axis.end === 24)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('older saved lists gain the starters once while keeping selection, edits and later removals', async ({
  page,
}) => {
  const privateSite = {
    id: 'initial-site',
    name: 'My saved ridge',
    lat: 45,
    lon: -120,
    tz: 'America/Los_Angeles',
    elevation: 1234,
  };
  await page.addInitScript((site) => {
    if (!localStorage.getItem('npa:favorites'))
      localStorage.setItem(
        'npa:favorites',
        JSON.stringify({ version: 1, sites: [site], selectedId: site.id }),
      );
  }, privateSite);
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const picker = page.locator('#siteSel');
  await expect(picker).toHaveValue('site:initial-site');
  const merged = await page.evaluate(() => JSON.parse(localStorage.getItem('npa:favorites')!));
  expect(merged.sites).toHaveLength(7);
  expect(merged.sites[0]).toEqual(privateSite);
  expect(merged.selectedId).toBe('initial-site');
  expect(merged.starterVersion).toBe(1);
  await picker.selectOption('manage');
  await page.locator('#siteFavorite').selectOption('quito-astronomical-observatory');
  await page.locator('#siteRemove').click();
  await page.locator('#siteConfirmRemove').click();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(picker).toHaveValue('site:initial-site');
  await expect(picker.locator('option[value="site:quito-astronomical-observatory"]')).toHaveCount(
    0,
  );
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('npa:favorites')!));
  expect(after.sites).toHaveLength(6);
  expect(after.sites[0]).toEqual(privateSite);
});
