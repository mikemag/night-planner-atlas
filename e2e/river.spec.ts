import { expect, test, type Page } from '@playwright/test';
import { fmtClock, fmtClockS, fmtDur } from '../src/model/format';

interface PaintedText {
  text: string;
  y: number;
  left: number;
  right: number;
  fontSize: number;
}

interface PaintedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

declare global {
  interface Window {
    riverText: PaintedText[];
    riverRects: PaintedRect[];
    riverDateTicks: PaintedRect[];
    riverCurves: number;
  }
}

/** Record actual canvas text in the latest frame, including its measured horizontal bounds. */
async function openRiver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.riverText = [];
    window.riverRects = [];
    window.riverDateTicks = [];
    window.riverCurves = 0;
    const segments = new WeakMap<CanvasRenderingContext2D, number>();
    const begin = CanvasRenderingContext2D.prototype.beginPath;
    CanvasRenderingContext2D.prototype.beginPath = function () {
      segments.set(this, 0);
      begin.call(this);
    };
    const line = CanvasRenderingContext2D.prototype.lineTo;
    CanvasRenderingContext2D.prototype.lineTo = function (x, y) {
      segments.set(this, (segments.get(this) ?? 0) + 1);
      line.call(this, x, y);
    };
    const strokePath = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (path?: Path2D) {
      if (this.canvas.id === 'cv' && (segments.get(this) ?? 0) > 50) window.riverCurves++;
      Reflect.apply(strokePath, this, path ? [path] : []);
    };
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'cv' && x === 0 && y === 0 && h > 100) {
        window.riverText = [];
        window.riverRects = [];
        window.riverDateTicks = [];
        window.riverCurves = 0;
      }
      if (this.canvas.id === 'cv' && w === 6 && h === 1)
        window.riverDateTicks.push({ left: x, top: y, width: w, height: h });
      fill.call(this, x, y, w, h);
    };
    const write = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s, x, y, maxWidth) {
      if (this.canvas.id === 'cv') {
        const width = this.measureText(s).width;
        const left =
          x - (this.textAlign === 'right' ? width : this.textAlign === 'center' ? width / 2 : 0);
        window.riverText.push({
          text: s,
          y,
          left,
          right: left + width,
          fontSize: parseFloat(this.font.match(/[\d.]+px/)![0]),
        });
      }
      if (maxWidth == null) write.call(this, s, x, y);
      else write.call(this, s, x, y, maxWidth);
    };
    const stroke = CanvasRenderingContext2D.prototype.strokeRect;
    CanvasRenderingContext2D.prototype.strokeRect = function (left, top, width, height) {
      if (this.canvas.id === 'cv') window.riverRects.push({ left, top, width, height });
      stroke.call(this, left, top, width, height);
    };
  });
  await page.clock.setFixedTime(new Date('2026-09-24T03:00:00Z'));
  await page.goto('./');
  await page.waitForFunction(() => (window.__npa?.nights.length ?? 0) > 0);
  await expect(page.locator('#loading')).toBeHidden();
  await painted(page);
}

async function painted(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}

const zoom = (page: Page, name: string) =>
  page.locator('#viewCtl').getByRole('button', { name, exact: true }).click();
const scroll = (page: Page) => page.locator('#scroller').evaluate((e) => e.scrollTop);

async function rowTimes(page: Page, id: string) {
  return page.evaluate((id) => {
    const i = window.__npa!.nights.findIndex((n) => n.id === id);
    const y = 30 + i * 20 - document.getElementById('scroller')!.scrollTop + 8.5;
    return {
      windows: window.__npa!.nights[i].mfH,
      labels: window.riverText
        .filter((t) => Math.abs(t.y - y) < 1 && /^\d+:\d+[ap]$/.test(t.text))
        .map((t) => t.text),
      y,
    };
  }, id);
}

test('Month shows window times without hover on weekdays and weekends wherever they fit', async ({
  page,
}) => {
  await openRiver(page);
  await expect(
    page.locator('#viewCtl').getByRole('button', { name: 'Green edge', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() =>
    window.__npa!.select(
      window.__npa!.nights.findIndex((n) => n.id === '2026-10-08'),
      true,
      true,
    ),
  );
  await painted(page);
  for (const id of ['2026-10-08', '2026-10-09', '2026-10-10']) {
    const row = await rowTimes(page, id);
    expect(row.windows.length).toBeGreaterThan(0);
    expect(row.labels).toEqual(row.windows.flat().map(fmtClockS));
  }
  const monday = await rowTimes(page, '2026-10-12');
  expect(monday.windows.length).toBeGreaterThan(0);
  expect(monday.labels).toEqual(monday.windows.flat().map(fmtClockS));
  const box = (await page.locator('#cv').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + monday.y);
  await painted(page);
  const hovered = await rowTimes(page, '2026-10-12');
  expect(hovered.labels).toEqual(hovered.windows.flat().map(fmtClockS));
});

test('River display, zoom and focus preserve the browsed night away from selection', async ({
  page,
}) => {
  await openRiver(page);
  const selection = await page.locator('#insDate').textContent();
  // Browse well away from the selection, seven pixels into a Month row.
  await page.locator('#scroller').evaluate((e) => {
    e.scrollTop = 150 * 20 + 7;
  });
  await page.locator('#viewCtl').getByRole('button', { name: 'Black only', exact: true }).click();
  expect(await scroll(page)).toBe(3007);
  await zoom(page, 'Week');
  expect(Math.abs((await scroll(page)) - (150 * 48 + (7 / 20) * 48))).toBeLessThanOrEqual(1);
  await zoom(page, 'Month');
  expect(Math.abs((await scroll(page)) - 3007)).toBeLessThanOrEqual(1);
  await page.locator('#focusSeg button[data-val="3"]').click();
  await page.locator('#focusSeg button[data-val="0"]').click();
  // Browsers round scrollTop to whole pixels; expanding an 8 px context row can amplify that.
  expect(Math.abs((await scroll(page)) - 3007)).toBeLessThanOrEqual(3);
  await expect(page.locator('#insDate')).toHaveText(selection!);
  await zoom(page, 'Year');
  await zoom(page, 'Week');
  // Year fits the range and clamps scroll to its start; zooming back must not jump to selection.
  expect(await scroll(page)).toBeLessThan(200);
});

test('phone River labels stay in their columns in Month and Week', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRiver(page);
  await page.evaluate(() =>
    window.__npa!.select(
      window.__npa!.nights.findIndex((n) => n.id === '2026-10-08'),
      true,
      true,
    ),
  );
  for (const mode of ['Month', 'Week']) {
    await zoom(page, mode);
    await painted(page);
    const { width, labels } = await page
      .locator('#cv')
      .evaluate((e) => ({ width: e.clientWidth, labels: window.riverText }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const heading = labels.find((t) => t.text === 'Moon-free')!;
    expect(heading.left).toBeGreaterThanOrEqual(width - 88);
    expect(heading.right).toBeLessThanOrEqual(width);
    expect(labels.find((t) => t.text === 'Oct ’26')).toBeTruthy();
    const times = labels.filter(
      (t) => t.y > 30 && /^(\d+:\d+[ap]|sunset |sunrise |moonrise |moonset )/.test(t.text),
    );
    expect(times.length).toBeGreaterThan(0);
    for (const label of times) {
      expect(label.left).toBeGreaterThanOrEqual(74);
      expect(label.right).toBeLessThanOrEqual(width - 88);
    }
    const total = await page.evaluate(
      () => window.__npa!.nights.find((n) => n.id === '2026-10-08')!.mfMs,
    );
    const duration = labels.find((t) => t.text === fmtDur(total))!;
    expect(duration).toBeTruthy();
    expect(duration.left).toBeGreaterThanOrEqual(width - 88);
    expect(duration.right).toBeLessThanOrEqual(width);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-river-phone-${mode.toLowerCase()}.png`,
      });
  }
  await zoom(page, 'Month');
  await page.evaluate(() =>
    window.__npa!.select(
      window.__npa!.nights.findIndex((n) => n.id === '2026-10-30'),
      true,
      true,
    ),
  );
  await painted(page);
  const short = await rowTimes(page, '2026-10-30');
  expect(short.windows.length).toBeGreaterThan(0);
  expect(short.labels).toEqual([]);
});

test('River uses a fixed pointer readout without a floating card or layout changes', async ({
  page,
}, info) => {
  await openRiver(page);
  await page.evaluate(() =>
    window.__npa!.select(
      window.__npa!.nights.findIndex((n) => n.id === '2026-10-08'),
      true,
      true,
    ),
  );
  await painted(page);
  const selection = await page.locator('#insDate').textContent();
  const box = (await page.locator('#cv').boundingBox())!;
  const readout = page.getByRole('group', { name: 'River readout' });
  const before = await readout.boundingBox();
  const ax = await page.evaluate(() => window.__npa!.ax!);
  const plotWidth = box.width - 92 - 120 - 96;
  // Use an integer pointer coordinate: WebKit truncates fractional mouse positions.
  const x = Math.round(92 + ((15 - ax.start) / (ax.end - ax.start)) * plotWidth);
  const clock = fmtClock(ax.start + ((x - 92) / plotWidth) * (ax.end - ax.start));
  await page.mouse.move(box.x + x, box.y + 30 + 20 + 10);
  await expect(readout).toContainText(
    `Fri Oct 9, 2026 · ${clock} · Astronomical darkness · Moon center`,
  );
  await expect(page.locator('#tip')).toBeHidden();
  await expect(page.locator('#insDate')).toHaveText(selection!);
  expect(await page.locator('#cv').boundingBox()).toEqual(box);
  expect(await readout.boundingBox()).toEqual(before);
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-river-readout.png`,
    });
  await page.mouse.move(1, 1);
  await expect(readout).toBeEmpty();
  expect(await readout.boundingBox()).toEqual(before);
  await page.locator('#cv').focus();
  await page.keyboard.press('ArrowRight');
  await expect(readout).toContainText('Fri Oct 9, 2026');
  await expect(readout).toContainText('moon-free');
  await expect(readout).toContainText('PM –');
  await page.locator('#viewSeg').getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('#riverReadout')).toBeHidden();
});

test('Year readout supplies the hovered night total and window', async ({ page }) => {
  await openRiver(page);
  await zoom(page, 'Year');
  await painted(page);
  const box = (await page.locator('#cv').boundingBox())!;
  const { y, total } = await page.evaluate(() => {
    const nights = window.__npa!.nights;
    const i = nights.findIndex((n) => n.id === '2026-10-09');
    const h = Math.max(1, (document.getElementById('cv')!.clientHeight - 40) / nights.length);
    return {
      y: 30 + (i + 0.5) * h - document.getElementById('scroller')!.scrollTop,
      total: nights[i].mfMs,
    };
  });
  await page.mouse.move(box.x + box.width / 2, box.y + y);
  expect(total).toBeGreaterThan(0);
  await expect(page.locator('#riverReadout')).toContainText(`${fmtDur(total)} moon-free`);
  await expect(page.locator('#riverReadout')).toContainText('Fri Oct 9, 2026');
  await expect(page.locator('#riverReadout')).toContainText('PM –');
  await expect(page.locator('#tip')).toBeHidden();
});

test.describe('touch River', () => {
  test.use({ hasTouch: true });
  test('tap reveals the selected night summary without a tooltip or horizontal overflow', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRiver(page);
    const box = (await page.locator('#cv').boundingBox())!;
    await page.touchscreen.tap(box.x + 150, box.y + 30 + 5 * 20 + 10);
    await expect(page.locator('#insDate')).toHaveText('Fri Sep 25 → Sat Sep 26');
    await expect(page.locator('#riverReadout')).toContainText('Fri Sep 25, 2026');
    await expect(page.locator('#tip')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const readout = page.locator('#riverReadout');
    await expect(readout).toBeVisible();
    expect(await readout.evaluate((e) => e.scrollHeight)).toBeLessThanOrEqual(
      await readout.evaluate((e) => e.clientHeight),
    );
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-river-phone-selected.png`,
        fullPage: true,
      });
  });
});

/** Read the actual painted viewport, rather than duplicating the minimap geometry in tests. */
async function miniThumb(page: Page) {
  await painted(page);
  return page
    .locator('#cv')
    .evaluate((cv) => window.riverRects.filter((r) => r.left > cv.clientWidth - 96).at(-1)!);
}

test('minimap has readable month labels, year context and a visible viewport', async ({
  page,
}, info) => {
  await openRiver(page);
  const { width, labels } = await page.locator('#cv').evaluate((cv) => ({
    width: cv.clientWidth,
    labels: window.riverText.filter((t) => t.left > cv.clientWidth - 96),
  }));
  const months = labels.filter((t) =>
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(t.text),
  );
  expect(months).toHaveLength(14);
  expect(months.some((t) => t.text === 'Jan')).toBe(true);
  for (const label of months) {
    expect(label.fontSize).toBeGreaterThanOrEqual(11.5);
    expect(label.right).toBeLessThan(width - 50);
  }
  expect(labels.find((t) => t.text === '2026–27')).toBeTruthy();
  await zoom(page, 'Week');
  expect((await miniThumb(page)).height).toBeGreaterThanOrEqual(24);
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-river-minimap.png`,
    });
  await zoom(page, 'Year');
  expect(await miniThumb(page)).toBeUndefined();
});

test('minimap viewport keeps the grab point in Month, Week and new-moon focus', async ({
  page,
}) => {
  await openRiver(page);
  const selection = await page.locator('#insDate').textContent();
  for (const [mode, focus] of [
    ['Month', '0'],
    ['Week', '0'],
    ['Month', '3'],
    ['Week', '3'],
  ]) {
    await zoom(page, mode);
    await page.locator(`#focusSeg button[data-val="${focus}"]`).click();
    await page.locator('#scroller').evaluate((e) => {
      e.scrollTop = 3007;
    });
    for (const edge of ['top', 'bottom']) {
      const thumb = await miniThumb(page);
      const box = (await page.locator('#cv').boundingBox())!;
      const x = box.x + thumb.left + thumb.width / 2;
      const y = box.y + thumb.top + (edge === 'top' ? 3 : thumb.height - 3);
      await page.mouse.move(x, y);
      await expect(page.locator('#cv')).toHaveCSS('cursor', 'grab');
      const before = await scroll(page);
      await page.mouse.down();
      expect(await scroll(page)).toBe(before);
      await expect(page.locator('#cv')).toHaveCSS('cursor', 'grabbing');
      await page.mouse.move(x, y + 12);
      expect(await scroll(page)).toBeGreaterThan(before);
      await page.mouse.move(x, y);
      expect(Math.abs((await scroll(page)) - before)).toBeLessThanOrEqual(1);
      await page.mouse.up();
    }
  }
  await expect(page.locator('#insDate')).toHaveText(selection!);
  await expect(page.locator('#tip')).toBeHidden();
});

test('minimap track clicks center dates, drags clamp, and release or cancellation stops dragging', async ({
  page,
}) => {
  await openRiver(page);
  const box = (await page.locator('#cv').boundingBox())!;
  const x = box.x + box.width - 25;
  const before = await scroll(page);
  await page.mouse.click(x, box.y + 15);
  expect(await scroll(page)).toBe(before); // The year heading is not a navigation target.
  await page.mouse.click(x, box.y + box.height * 0.7);
  expect(await scroll(page)).toBeGreaterThan(5000);
  const thumb = await miniThumb(page);
  const y = box.y + thumb.top + thumb.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height + 20);
  const max = await page.locator('#scroller').evaluate((e) => e.scrollHeight - e.clientHeight);
  expect(await scroll(page)).toBe(max);
  await page.mouse.move(x, box.y - 10);
  expect(await scroll(page)).toBe(0);
  await page.mouse.up();
  await page.mouse.move(x, box.y + box.height / 2);
  expect(await scroll(page)).toBe(0);
  const topThumb = await miniThumb(page);
  await page.mouse.move(x, box.y + topThumb.top + topThumb.height / 2);
  await page.mouse.down();
  await page.locator('#cv').dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.move(x, box.y + box.height / 2);
  expect(await scroll(page)).toBe(0);
  await page.mouse.up();
});

for (const width of [1512, 390]) {
  test(`focus keeps month and weekly dates readable without collisions at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await openRiver(page);
    await page.locator('#focusSeg button[data-val="3"]').click();
    const gl = width === 390 ? 56 : 70;
    const selectDate = async (id: string) => {
      await page.evaluate(
        (id) =>
          window.__npa!.select(
            window.__npa!.nights.findIndex((n) => n.id === id),
            true,
            true,
          ),
        id,
      );
      await painted(page);
    };
    const gutter = () =>
      page.evaluate(
        (gl) =>
          window.riverText.filter(
            (t) =>
              t.y >= 38 &&
              t.y <= document.getElementById('cv')!.clientHeight - 8 &&
              t.right <= gl &&
              t.left >= 0,
          ),
        gl,
      );
    const assertReadable = async () => {
      const labels = (await gutter()).sort((a, b) => a.y - b.y);
      expect(labels.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < labels.length; i++)
        expect(labels[i].y - labels[i - 1].y).toBeGreaterThanOrEqual(15);
      const box = (await page.locator('#cv').boundingBox())!;
      const markers = await page.evaluate(
        (gl) => window.riverText.filter((t) => t.fontSize === 11.5 && t.right <= gl),
        gl,
      );
      for (const marker of markers) {
        expect(marker.y).toBeGreaterThanOrEqual(38);
        expect(marker.y).toBeLessThanOrEqual(box.height - 8);
      }
      for (const label of labels) {
        expect(label.left).toBeGreaterThanOrEqual(4);
        expect(label.y + label.fontSize / 2).toBeLessThan(box.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    };
    await selectDate('2026-10-30');
    let labels = await gutter();
    const november = labels.find((t) => t.text === (width === 390 ? 'Nov ’26' : 'Nov 2026'))!;
    expect(november.fontSize).toBe(11.5);
    expect(labels.find((t) => t.text === 'Mon 16')?.fontSize).toBe(11.5);
    expect(labels.find((t) => t.text === 'Mon 2')).toBeUndefined();
    // November 1 is Sunday: the adjacent compressed Monday keeps a tick, not overlapping text.
    expect(
      await page.evaluate(
        (y) => window.riverDateTicks.some((t) => Math.abs(t.top - y - 8) <= 0.5),
        november.y,
      ),
    ).toBe(true);
    expect(labels.find((t) => t.text === 'Sun 8')?.fontSize).toBe(11); // Expanded night, normal daily label.
    await assertReadable();
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-river-focus-month-${width}.png`,
        fullPage: width === 390,
      });
    // A partly scrolled compressed row must not produce a cut-off date against the axis.
    await page.locator('#scroller').evaluate((e) => {
      e.scrollTop += 17;
    });
    await painted(page);
    await assertReadable();
    await zoom(page, 'Week');
    await selectDate('2026-11-12');
    labels = await gutter();
    expect(labels.find((t) => t.text === 'Mon 16')?.fontSize).toBe(11.5);
    expect(labels.find((t) => t.text === (width === 390 ? 'Dec ’26' : 'Dec 2026'))?.fontSize).toBe(
      11.5,
    );
    expect(labels.find((t) => t.text === 'Mon 30')).toBeUndefined(); // One context row before Dec 1.
    expect(labels.find((t) => t.text === 'Thu 12')).toBeUndefined(); // Context uses weekly anchors.
    await assertReadable();
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-river-focus-week-${width}.png`,
        fullPage: width === 390,
      });
    await zoom(page, 'Month');
    await selectDate('2026-12-30');
    expect(
      (await gutter()).find((t) => t.text === (width === 390 ? 'Jan ’27' : 'Jan 2027'))?.fontSize,
    ).toBe(11.5);
    for (const focus of ['5', '7', '10']) {
      await page.locator(`#focusSeg button[data-val="${focus}"]`).click();
      await selectDate('2026-12-30');
      await assertReadable();
    }
    await page.locator('#focusSeg button[data-val="0"]').click();
    await painted(page);
    labels = await gutter();
    expect(labels.some((t) => t.text === 'Jan 1')).toBe(true);
    expect(labels.some((t) => t.text.includes('2027') || t.text.includes('’27'))).toBe(false);
  });
}

for (const width of [1512, 390]) {
  test(`Week emphasizes windows and totals without event labels or altitude tracks at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await openRiver(page);
    await zoom(page, 'Week');
    await page.evaluate(() =>
      window.__npa!.select(
        window.__npa!.nights.findIndex((n) => n.id === '2026-10-08'),
        true,
        true,
      ),
    );
    await painted(page);
    const { labels, curves, bounds, total } = await page.evaluate(() => {
      const n = window.__npa!.nights.find((n) => n.id === '2026-10-08')!;
      return {
        labels: window.riverText,
        curves: window.riverCurves,
        bounds: n.mfH[0],
        total: n.mfMs,
      };
    });
    expect(curves).toBe(0);
    expect(labels.filter((t) => /sunset|sunrise|moonrise|moonset/i.test(t.text))).toEqual([]);
    for (const value of bounds.map(fmtClockS)) {
      const label = labels.find((t) => t.text === value && t.y < 78)!;
      expect(label).toBeTruthy();
      expect(label.y).toBe(52.5); // Centered in the first 48 px row, below the 30 px axis.
      expect(label.fontSize).toBe(11.5);
    }
    expect(labels.find((t) => t.text === fmtDur(total))?.fontSize).toBe(11.5);
    const height = await page.locator('#cv').evaluate((e) => e.clientHeight);
    const dates = labels.filter(
      (t) =>
        t.right <= (width === 390 ? 52 : 70) &&
        t.y > 30 &&
        t.y < height - 6 &&
        /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+$/.test(t.text),
    );
    expect(dates).toHaveLength(width === 390 ? 7 : 14);
    for (let i = 0; i < dates.length; i++) {
      expect(dates[i].fontSize).toBe(12);
      expect(dates[i].left).toBeGreaterThanOrEqual(4);
      if (i) expect(dates[i].y - dates[i - 1].y).toBe(48);
    }
    await expect(page.locator('#insMoon')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-river-week-simple-${width}.png`,
        fullPage: width === 390,
      });
    await page.evaluate(() =>
      window.__npa!.select(
        window.__npa!.nights.findIndex((n) => n.id === '2026-10-31'),
        true,
        true,
      ),
    );
    await painted(page);
    const clockChange = await page.evaluate(() => ({
      notice: window.riverText.find((t) => t.text === 'Clocks change tonight')!,
      windows: window.riverText.filter((t) => t.y < 78 && /^\d+:\d+[ap]$/.test(t.text)),
    }));
    expect(clockChange.notice.y).toBe(39);
    for (const time of clockChange.windows)
      expect(time.y - clockChange.notice.y).toBeGreaterThanOrEqual(13);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-river-week-clock-${width}.png`,
      });
    await page.evaluate(() =>
      window.__npa!.select(
        window.__npa!.nights.findIndex((n) => n.id === '2027-01-08'),
        true,
        true,
      ),
    );
    await painted(page);
    const longTotal = await page.locator('#cv').evaluate((cv) => ({
      width: cv.clientWidth,
      labels: window.riverText.filter((t) => /^1\d+h \d+m$/.test(t.text) && t.y < 78),
    }));
    expect(longTotal.labels.length).toBeGreaterThan(0);
    for (const label of longTotal.labels)
      expect(label.right).toBeLessThan(longTotal.width - (width === 390 ? 0 : 96));
  });
}
