import { expect, test, type Page } from '@playwright/test';
import { phaseName } from '../src/model/describe';
import { fmtClock, fmtDur } from '../src/model/format';

const detail = (page: Page) => page.locator('#riverDetail');
const scroller = (page: Page) => page.locator('#scroller');
async function painted(page: Page) {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}
async function open(page: Page, width = 1512, height = 920) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    const stroke = CanvasRenderingContext2D.prototype.strokeRect;
    CanvasRenderingContext2D.prototype.strokeRect = function (x, y, width, height) {
      if (this.canvas.id === 'cv' && width > this.canvas.clientWidth / 2)
        Object.assign(window, { riverOutline: { x, width } });
      stroke.call(this, x, y, width, height);
    };
  });
  await page.clock.setFixedTime(new Date('2026-09-24T03:00:00Z'));
  await page.goto('./');
  await page.waitForFunction(() => (window.__npa?.nights.length ?? 0) > 0);
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    const a = window.__npa!;
    a.select(
      a.nights.findIndex((n) => n.id === '2026-10-08'),
      true,
      true,
    );
  });
  await painted(page);
}
async function selectedRow(page: Page) {
  return page.evaluate(() => {
    const a = window.__npa!;
    return {
      index: a.S.sel,
      y: a.riverRows.tops[a.S.sel] - document.getElementById('scroller')!.scrollTop,
      height: a.riverRows.heights[a.S.sel],
      expanded: a.S.riverExpanded,
    };
  });
}

for (const width of [1512, 390]) {
  test(`Month expands key facts, toggles, and preserves compact Year at ${width}px`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, width, width === 390 ? 844 : 920);
    await expect(
      page.locator('#viewCtl').getByRole('button', { name: 'Week', exact: true }),
    ).toHaveCount(0);
    await expect(detail(page)).toBeHidden();
    const collapsed = await selectedRow(page);
    const outline = () =>
      page.evaluate(
        () => (window as unknown as { riverOutline: { x: number; width: number } }).riverOutline,
      );
    const compactOutline = await outline();
    expect(collapsed.height).toBe(width === 390 ? 32 : 20);
    await page.locator('#cv').press('Enter');
    await expect(detail(page)).toBeVisible();
    await expect(page.locator('#cv')).toHaveAttribute('aria-expanded', 'true');
    await painted(page);
    expect(await outline()).toEqual(compactOutline);
    const moonLevels = await detail(page)
      .locator('[data-event="Moonrise"], [data-event="Moonset"]')
      .evaluateAll((nodes) => nodes.map((node) => node.querySelector('text')!.getAttribute('y')));
    expect(moonLevels.length).toBe(2);
    expect(new Set(moonLevels).size).toBe(1);
    const n = await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel]);
    await expect(detail(page).locator('svg')).toHaveAttribute(
      'aria-label',
      new RegExp(`${fmtDur(n.mfMs)} usable dark`),
    );
    for (const t of n.mfH.flat().map(fmtClock)) await expect(detail(page)).toContainText(t);
    for (const t of [n.evH.sunset, n.evH.sunrise, n.evH.astroDusk, n.evH.astroDawn].map(fmtClock))
      await expect(detail(page)).toContainText(t);
    await expect(detail(page)).toContainText(`${Math.round(n.illum * 100)}% lit`);
    await expect(detail(page).locator('.river-moon-phase')).toHaveText(phaseName(n));
    await expect(detail(page)).not.toContainText('America/Los_Angeles');
    await expect(detail(page).getByRole('button')).toHaveCount(0);
    await expect(page.locator('#viewCtl').getByRole('button', { name: /Collapse/ })).toHaveCount(0);
    const row = await selectedRow(page);
    expect(Math.abs(row.y - collapsed.y)).toBeLessThanOrEqual(1);
    expect(row.height).toBeGreaterThan(150);
    const db = (await detail(page).boundingBox())!;
    const cb = (await page.locator('#cv').boundingBox())!;
    expect(Math.abs(db.y - (cb.y + 30 + row.y + collapsed.height))).toBeLessThanOrEqual(1);
    expect(db.x).toBeGreaterThanOrEqual(cb.x);
    expect(db.x + db.width).toBeLessThanOrEqual(cb.x + cb.width);
    const annotation = detail(page).locator('svg');
    const bounds = (await annotation.boundingBox())!;
    const callouts = await detail(page)
      .locator('.river-event')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
        }),
      );
    expect(callouts.length).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < callouts.length; i++) {
      const a = callouts[i];
      expect(a.x).toBeGreaterThanOrEqual(bounds.x);
      expect(a.right).toBeLessThanOrEqual(bounds.x + bounds.width);
      for (const b of callouts.slice(i + 1)) {
        const separate =
          a.right + 5 <= b.x || b.right + 5 <= a.x || a.bottom + 1 <= b.y || b.bottom + 1 <= a.y;
        expect(separate).toBe(true);
      }
    }
    const centered = await detail(page)
      .locator('.river-window')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const middle =
            (Number(node.getAttribute('data-start-x')) + Number(node.getAttribute('data-end-x'))) /
            2;
          return Math.abs(
            Number(node.querySelector('.river-window-duration')!.getAttribute('x')) - middle,
          );
        }),
      );
    expect(centered.length).toBeGreaterThan(0);
    expect(centered.every((distance) => distance < 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-river-expanded-${width}.png`,
        fullPage: width === 390,
      });

    await expect(detail(page).getByRole('link', { name: 'Full detail' })).toHaveCount(0);
    await expect(page.locator('#inspector')).toBeHidden();
    await page.locator('#cv').focus();
    await page.keyboard.press('Escape');
    await expect(detail(page)).toBeHidden();
    expect((await selectedRow(page)).index).toBe(row.index);
    await page.keyboard.press('ArrowRight');
    expect((await selectedRow(page)).expanded).toBe(false);
    await page.keyboard.press(' ');
    await expect(detail(page)).toBeVisible();

    await page.locator('#viewCtl').getByRole('button', { name: 'Year', exact: true }).click();
    await expect(detail(page)).toBeHidden();
    await page.locator('#cv').press('ArrowRight');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const rows = [...window.__npa!.riverRows.heights];
          return Math.abs(
            rows.reduce((sum, h) => sum + h, 42) -
              document.getElementById('scroller')!.clientHeight,
          );
        }),
      )
      .toBeLessThanOrEqual(1);
    const year = await page.evaluate(() => [...window.__npa!.riverRows.heights]);
    expect(new Set(year).size).toBe(1);
    expect(Math.max(...year)).toBeLessThan(3);
    expect(
      await scroller(page).evaluate((e) => e.scrollHeight - e.clientHeight),
    ).toBeLessThanOrEqual(1);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-river-year-${width}.png`,
      });
    await page.locator('#viewCtl').getByRole('button', { name: 'Month', exact: true }).click();
    await expect(detail(page)).toBeVisible();
    expect((await selectedRow(page)).y).toBeGreaterThanOrEqual(0);
    // Only the timeline/header toggles, not clicking a callout or selecting text.
    await detail(page).locator('.river-event').first().click();
    await expect(detail(page)).toBeVisible();
    await page.locator('#cv').press('Escape');
    await expect(detail(page)).toBeHidden();
    await expect(page.locator('#cv')).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('keyboard and pointer moves keep the open header anchored, including focus and range ends', async ({
  page,
}) => {
  await open(page);
  await scroller(page).evaluate((e) => {
    e.scrollTop -= 80;
  });
  const before = await selectedRow(page);
  const cb = (await page.locator('#cv').boundingBox())!;
  await page.mouse.click(cb.x + 350, cb.y + 30 + before.y + 10);
  await expect(detail(page)).toBeVisible();
  expect((await selectedRow(page)).y).toBe(before.y);
  await page.keyboard.press('ArrowRight');
  await painted(page);
  expect((await selectedRow(page)).index).toBe(before.index + 1);
  expect(Math.abs((await selectedRow(page)).y - before.y)).toBeLessThanOrEqual(1);
  await page.keyboard.press('ArrowDown');
  expect((await selectedRow(page)).index).toBe(before.index + 8);
  expect(Math.abs((await selectedRow(page)).y - before.y)).toBeLessThanOrEqual(1);
  const target = await page.evaluate(() => {
    const a = window.__npa!;
    return {
      i: a.S.sel + 1,
      y: 30 + a.riverRows.tops[a.S.sel + 1] - document.getElementById('scroller')!.scrollTop,
    };
  });
  await page.mouse.click(cb.x + 350, cb.y + target.y + 10);
  await painted(page);
  expect((await selectedRow(page)).index).toBe(target.i);
  const moved = await selectedRow(page);
  const available = await page.locator('#cv').evaluate((e) => e.clientHeight - 30);
  // Preserve the header until the new annotation lanes need a little more room at the bottom.
  const expectedY = Math.max(0, Math.min(target.y - 30, available - moved.height));
  expect(Math.abs(moved.y - expectedY)).toBeLessThanOrEqual(1);
  await page.locator('#focusSeg button[data-val="3"]').click();
  expect((await selectedRow(page)).height).toBeGreaterThan(150);
  await expect(detail(page)).toBeVisible();
  for (const which of ['first', 'last']) {
    await page.evaluate((which) => {
      const a = window.__npa!;
      a.select(which === 'first' ? 0 : a.nights.length - 1, true);
    }, which);
    await painted(page);
    const r = await selectedRow(page);
    expect(r.y).toBeGreaterThanOrEqual(0);
    const canvasHeight = await page.locator('#cv').evaluate((e) => e.clientHeight);
    expect(r.y + r.height).toBeLessThanOrEqual(canvasHeight - 30 + 1);
  }
});

test('resize and scroll keep details aligned and the selected night stable', async ({ page }) => {
  await open(page);
  await page.locator('#cv').press('Enter');
  await scroller(page).evaluate((e) => {
    e.scrollTop += 70;
  });
  const selected = (await selectedRow(page)).index;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(detail(page)).toHaveClass(/narrow/);
  await painted(page);
  expect((await selectedRow(page)).index).toBe(selected);
  const position = async () => {
    const r = await selectedRow(page);
    const box = (await detail(page).boundingBox())!;
    const cv = (await page.locator('#cv').boundingBox())!;
    return Math.abs(box.y - cv.y - 30 - r.y - 32);
  };
  expect(await position()).toBeLessThanOrEqual(1);
  // Wheel gestures over the text scroll the chart, without closing or following the night.
  await detail(page).locator('.river-event').last().hover();
  const st = await scroller(page).evaluate((e) => e.scrollTop);
  await page.mouse.wheel(0, 90);
  await expect.poll(() => scroller(page).evaluate((e) => e.scrollTop)).toBeGreaterThan(st);
  expect((await selectedRow(page)).index).toBe(selected);
  expect((await selectedRow(page)).expanded).toBe(true);
  expect(await position()).toBeLessThanOrEqual(1);
});

test('old Week preferences open Month and canceled touch pans do not expand a row', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('npa:riverZoom', '"week"'));
  await open(page, 390, 568);
  await expect(
    page.locator('#viewCtl').getByRole('button', { name: 'Month', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const cv = page.locator('#cv');
  const box = (await cv.boundingBox())!;
  await cv.dispatchEvent('pointerdown', {
    clientX: box.x + 150,
    clientY: box.y + 42,
    pointerId: 4,
    pointerType: 'touch',
    button: 0,
  });
  await cv.dispatchEvent('pointercancel', { pointerId: 4, pointerType: 'touch' });
  await cv.dispatchEvent('pointerup', {
    clientX: box.x + 150,
    clientY: box.y + 42,
    pointerId: 4,
    pointerType: 'touch',
  });
  await expect(detail(page)).toBeHidden();
  await page.locator('#cv').press('Enter');
  await expect(detail(page)).toBeVisible();
  await scroller(page).evaluate((e) => {
    e.scrollTop += 160;
  });
  await painted(page);
  const inset = await detail(page).evaluate((e) => e.style.clipPath);
  expect(parseFloat(inset.match(/[\d.]+/)![0])).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('expanded facts stay accurate for no-window nights, clock changes and ignored crescents', async ({
  page,
}, info) => {
  await open(page);
  await page.locator('#cv').press('Enter');
  const choose = (id: string) =>
    page.evaluate((id) => {
      const a = window.__npa!;
      a.select(
        a.nights.findIndex((n) => n.id === id),
        true,
        true,
      );
    }, id);
  await choose('2026-09-25');
  await expect(detail(page).locator('.river-no-window')).toHaveText(
    'No usable dark with these Moon settings',
  );
  await expect(detail(page)).not.toContainText('0m usable dark');
  await expect(detail(page).locator('.river-detail-note')).not.toContainText(
    'No usable dark with these Moon settings',
  );
  await expect(detail(page)).toContainText('No usable dark with these Moon settings');
  await choose('2026-10-31');
  await expect(detail(page)).toContainText('Clocks change · elapsed durations');
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-river-expanded-clock-change.png`,
    });
  await choose('2026-10-06');
  await page.locator('#moonAltSel').selectOption('15');
  await expect(detail(page).locator('[data-event="Usable ends"]')).toHaveCount(1);
  await page.locator('#crescentSel').selectOption('0.3');
  await expect(detail(page)).toContainText('Moon ignored');
  const value = await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].mfMs);
  await expect(detail(page).locator('svg')).toHaveAttribute(
    'aria-label',
    new RegExp(`${fmtDur(value)} usable dark`),
  );
  await expect(detail(page).locator('svg')).toHaveCount(1);
});

for (const width of [1512, 390]) {
  test(`scrubbing keeps fixed heights, twilight levels and top duration at ${width}px`, async ({
    page,
  }, info) => {
    await open(page, width, width === 390 ? 844 : 920);
    await page.locator('#cv').press('Enter');
    const initial = await selectedRow(page);
    let reference: Record<string, string> | null = null;
    for (const date of [
      '2026-08-15',
      '2026-09-25',
      '2026-10-06',
      '2026-10-31',
      '2026-12-21',
      '2027-03-15',
      '2027-06-21',
      '2027-09-01',
    ]) {
      await page.evaluate((date) => {
        const a = window.__npa!;
        a.select(
          a.nights.findIndex((n) => n.id === date),
          true,
          true,
        );
      }, date);
      await painted(page);
      expect((await selectedRow(page)).height).toBe(initial.height);
      const levels = await detail(page)
        .locator('.river-event')
        .evaluateAll((nodes) =>
          Object.fromEntries(
            nodes
              .filter((node) => !/Moon|Usable/.test(node.getAttribute('data-event')!))
              .map((node) => [
                node.getAttribute('data-event')!,
                node.querySelector('text')!.getAttribute('y')!,
              ]),
          ),
        );
      if (!reference) reference = levels;
      for (const [event, y] of Object.entries(levels)) expect(y).toBe(reference[event]);
      const durationY = await detail(page)
        .locator('.river-window-duration')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('y')));
      expect(durationY.every((y) => y === '27')).toBe(true);
      const percent = detail(page).locator('.river-moon-percent');
      const iconX = width === 390 ? 63 : 81;
      await expect(percent).toHaveAttribute('x', String(iconX));
      await expect(percent).toHaveAttribute('y', '12');
      await expect(detail(page)).not.toContainText('Times:');
      if (process.env.SCREENSHOTS && date === '2026-09-25')
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-river-no-window-${width}.png`,
        });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    await page.locator('#cv').press('ArrowRight');
    expect((await selectedRow(page)).height).toBe(initial.height);
    await painted(page);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-river-stable-${width}.png`,
      });
  });
}
