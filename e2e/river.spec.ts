import { chooseFocus } from './header-controls';
import { seedPersonal } from './storage';
import { expect, test, type Page } from '@playwright/test';
import { fmtClock, fmtClockS, fmtDur } from '../src/model/format';

interface PaintedText {
  text: string;
  y: number;
  left: number;
  right: number;
  fontSize: number;
  color: string;
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
    riverNewMoonTicks: PaintedRect[];
    riverMoonGlyphs: Array<{ x: number; y: number }>;
  }
}

/** Record actual canvas text in the latest frame, including its measured horizontal bounds. */
async function openRiver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.riverText = [];
    window.riverRects = [];
    window.riverDateTicks = [];
    window.riverCurves = 0;
    window.riverNewMoonTicks = [];
    window.riverMoonGlyphs = [];
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (x, y, radius, start, end, counterclockwise) {
      if (this.canvas.id === 'cv' && radius <= 6) window.riverMoonGlyphs.push({ x, y });
      arc.call(this, x, y, radius, start, end, counterclockwise);
    };
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
        window.riverNewMoonTicks = [];
        window.riverMoonGlyphs = [];
      }
      if (this.canvas.id === 'cv' && w === 14 && h === 2)
        window.riverNewMoonTicks.push({ left: x, top: y, width: w, height: h });
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
          color: String(this.fillStyle),
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
    const rows = window.__npa!.riverRows;
    const bar =
      window.__npa!.S.riverExpanded && window.__npa!.S.sel === i ? rows.header : rows.heights[i];
    const y =
      30 + rows.tops[i] - document.getElementById('scroller')!.scrollTop + (bar - 1) / 2 - 1;
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
  ).toHaveCount(0);
  await expect(
    page.locator('#viewCtl').getByRole('button', { name: 'Black only', exact: true }),
  ).toHaveCount(0);
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

test('River zoom and focus preserve the browsed night away from selection', async ({ page }) => {
  await openRiver(page);
  const selection = (await page.locator('#riverSelection').textContent())!.split('.')[0];
  // Browse well away from the selection, seven pixels into a Month row.
  await page.locator('#scroller').evaluate((e) => {
    e.scrollTop = 150 * 20 + 7;
  });
  await chooseFocus(page, 3);
  await chooseFocus(page, 0);
  // Browsers round scrollTop to whole pixels; expanding an 8 px context row can amplify that.
  expect(Math.abs((await scroll(page)) - 3007)).toBeLessThanOrEqual(3);
  await expect(page.locator('#riverSelection')).toContainText(selection);
  await zoom(page, 'Year');
  await zoom(page, 'Month');
  // Year fits the range and clamps scroll to its start; zooming back must not jump to selection.
  expect(await scroll(page)).toBeLessThan(200);
});

test('phone River labels stay in their columns in Month', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRiver(page);
  await page.evaluate(() =>
    window.__npa!.select(
      window.__npa!.nights.findIndex((n) => n.id === '2026-10-08'),
      true,
      true,
    ),
  );
  for (const mode of ['Month']) {
    await zoom(page, mode);
    await painted(page);
    const { width, labels } = await page
      .locator('#cv')
      .evaluate((e) => ({ width: e.clientWidth, labels: window.riverText }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const heading = labels.find((t) => t.text === 'Usable dark')!;
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
  const selection = (await page.locator('#riverSelection').textContent())!.split('.')[0];
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
  await expect(page.locator('#riverSelection')).toContainText(selection);
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
  await expect(readout).toContainText('usable dark');
  await expect(readout).toContainText('PM –');
  await page.locator('#viewSeg').getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Calendar readout' })).toBeVisible();
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
  await expect(page.locator('#riverReadout')).toContainText(`${fmtDur(total)} usable dark`);
  await expect(page.locator('#riverReadout')).toContainText('Fri Oct 9, 2026');
  await expect(page.locator('#riverReadout')).toContainText('PM –');
  await expect(page.locator('#tip')).toBeHidden();
});

test.describe('touch River', () => {
  test.use({ hasTouch: true });
  test('tap announces the selected night without reserving a hover readout on touch', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRiver(page);
    const box = (await page.locator('#cv').boundingBox())!;
    await page.touchscreen.tap(box.x + 150, box.y + 30 + 5 * 32 + 16);
    await expect(page.locator('#riverSelection')).toContainText('Fri Sep 25 → Sat Sep 26');
    await expect(page.locator('#riverReadout')).toContainText('Fri Sep 25, 2026');
    await expect(page.locator('#tip')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await expect(page.locator('#riverReadout')).toBeHidden();
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
  expect((await miniThumb(page)).height).toBeGreaterThanOrEqual(24);
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-river-minimap.png`,
    });
  await page.setViewportSize({ width: 1512, height: 350 });
  const sparseLabels = () =>
    page
      .locator('#cv')
      .evaluate((cv) =>
        window.riverText.filter(
          (t) =>
            t.left > cv.clientWidth - 96 &&
            /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(t.text),
        ),
      );
  await expect.poll(async () => (await sparseLabels()).length).toBeLessThan(14);
  const sparse = await sparseLabels();
  expect(sparse.some((t) => t.text === 'Jan')).toBe(true);
  for (let i = 1; i < sparse.length; i++)
    expect(sparse[i].y - sparse[i - 1].y).toBeGreaterThanOrEqual(14);
  await zoom(page, 'Year');
  expect(await miniThumb(page)).toBeUndefined();
});

test('minimap viewport keeps the grab point with expansion and new-moon focus', async ({
  page,
}) => {
  await openRiver(page);
  const selection = (await page.locator('#riverSelection').textContent())!.split('.')[0];
  for (const [mode, focus, expanded] of [
    ['Month', '0', false],
    ['Month', '0', true],
    ['Month', '3', false],
    ['Month', '3', true],
  ] as const) {
    await zoom(page, mode);
    await page.evaluate((expanded) => {
      if (window.__npa!.S.riverExpanded !== expanded) window.__npa!.toggleRiverNight();
    }, expanded);
    await chooseFocus(page, focus);
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
  await expect(page.locator('#riverSelection')).toContainText(selection);
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
    await chooseFocus(page, 3);
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
    // Keep the later Monday inside the phone canvas after the taller shared controls.
    await selectDate('2026-10-31');
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
    await selectDate('2026-12-30');
    expect(
      (await gutter()).find((t) => t.text === (width === 390 ? 'Jan ’27' : 'Jan 2027'))?.fontSize,
    ).toBe(11.5);
    for (const focus of ['5', '7', '10']) {
      await chooseFocus(page, focus);
      await selectDate('2026-12-30');
      await assertReadable();
    }
    await chooseFocus(page, 0);
    await painted(page);
    labels = await gutter();
    expect(labels.some((t) => t.text === 'Jan 1')).toBe(true);
    expect(labels.some((t) => t.text.includes('2027') || t.text.includes('’27'))).toBe(false);
  });
}

test.describe('new-moon event markers', () => {
  // The event's clock and date must follow the site even when the viewer is elsewhere.
  test.use({ timezoneId: 'Asia/Tokyo' });

  for (const width of [1512, 390]) {
    test(`event labels, glyphs and Year ticks stay distinct at ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
      await openRiver(page);
      const event = await page.evaluate(() => {
        const a = window.__npa!;
        const i = a.nights.findIndex((n) => n.quarter === 0 && n.m === 10);
        const t = a.lunations.find((l) => l.i === i)!.t;
        const instant = new Date(t + 30_000);
        const options = { timeZone: a.S.site.tz };
        return {
          i,
          id: a.nights[i].id,
          date: new Intl.DateTimeFormat('en-US', {
            ...options,
            month: 'short',
            day: 'numeric',
          }).format(instant),
          year: new Intl.DateTimeFormat('en-US', { ...options, year: 'numeric' }).format(instant),
          time: new Intl.DateTimeFormat('en-US', {
            ...options,
            hour: 'numeric',
            minute: '2-digit',
          }).format(instant),
          totals: a.nights.map((n) => n.mfMs),
        };
      });
      // This morning event belongs to the preceding evening's row.
      expect(event.id).toBe('2026-10-09');
      expect(event.date).toBe('Oct 10');
      const eventText = `New moon: ${event.date}, ${event.year} ${event.time}`;
      const readout = page.locator('#riverReadout');
      for (const focus of ['0', '3']) {
        await chooseFocus(page, focus);
        await page.evaluate((i) => window.__npa!.select(i, true, true), event.i);
        await painted(page);
        const geometry = await page.evaluate(
          ({ i, width }) => {
            const a = window.__npa!;
            const cv = document.getElementById('cv') as HTMLCanvasElement;
            const header = a.riverRows.heights[i];
            const cy =
              30 +
              a.riverRows.tops[i] -
              document.getElementById('scroller')!.scrollTop +
              (header - 1) / 2;
            const labels = window.riverText.filter(
              (t) => Math.abs(t.y - cy) <= 6 && /^(New Moon|Oct 10,)/.test(t.text),
            );
            const dpr = window.devicePixelRatio;
            const rgb = [
              ...cv
                .getContext('2d')!
                .getImageData(
                  Math.floor((Math.min(...labels.map((t) => t.left)) - 4) * dpr),
                  Math.floor(cy * dpr),
                  1,
                  1,
                ).data,
            ].slice(0, 3);
            const x0 = width === 390 ? (a.S.focus ? 78 : 74) : 92;
            const x1 = cv.clientWidth - (width === 390 ? 88 : 216);
            const night = a.nights[i];
            const nightMiddle = (night.evH.sunset! + night.evH.sunrise!) / 2;
            const center =
              x0 + ((nightMiddle - a.ax!.start) / (a.ax!.end - a.ax!.start)) * (x1 - x0);
            return {
              cy,
              header,
              labels,
              rgb,
              x0,
              x1,
              center,
              glyph: window.riverMoonGlyphs.some(
                (g) =>
                  Math.abs(g.y - cy) < 0.1 && g.x === (width === 390 ? (a.S.focus ? 67 : 63) : 81),
              ),
            };
          },
          { i: event.i, width },
        );
        expect(geometry.labels.map((t) => t.text)).toEqual(
          width === 390
            ? ['New Moon', `${event.date}, ${event.time}`]
            : [`New Moon · ${event.date}, ${event.time}`],
        );
        expect(geometry.header).toBe(focus === '3' ? 34 : width === 390 ? 32 : 20);
        expect(geometry.glyph).toBe(true);
        for (const label of geometry.labels) {
          expect(label.left).toBeGreaterThanOrEqual(geometry.x0 + 8);
          expect(label.right).toBeLessThanOrEqual(geometry.x1 - 8);
          expect((label.left + label.right) / 2).toBeCloseTo(geometry.center);
        }
        // Sample the actual backing pixels; check contrast in each project's real theme.
        const luminance = (rgb: number[]) =>
          rgb
            .map((v) => {
              const s = v / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        const foreground = luminance(
          geometry.labels[0].color
            .slice(1)
            .match(/../g)!
            .map((v) => parseInt(v, 16)),
        );
        const background = luminance(geometry.rgb);
        expect(
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
        ).toBeGreaterThan(7);
        await expect(readout).toContainText(eventText);
        const bounds = await readout.boundingBox();
        const cv = (await page.locator('#cv').boundingBox())!;
        await page.mouse.move(cv.x + (geometry.x0 + geometry.x1) / 2, cv.y + geometry.cy);
        await expect(readout).toContainText(eventText);
        expect(await readout.boundingBox()).toEqual(bounds);
        expect(await readout.evaluate((e) => e.scrollHeight <= e.clientHeight)).toBe(true);
        await page.mouse.move(1, 1);
        if (process.env.SCREENSHOTS)
          await page.screenshot({
            path: `test-results/screenshots/${info.project.name}-new-moon-${width}-focus-${focus}.png`,
            fullPage: true,
          });
      }
      await page.locator('#cv').press('Enter');
      await expect(page.locator('#riverDetail')).toBeVisible();
      await expect(page.locator('#riverDetail .river-moon-phase')).toHaveText('New moon');
      await painted(page);
      expect(
        await page.evaluate(() => window.riverText.some((t) => t.text.startsWith('New Moon'))),
      ).toBe(true);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-new-moon-expanded-${width}.png`,
          fullPage: true,
        });
      await page.locator('#cv').press('ArrowLeft');
      await painted(page);
      await expect(readout).not.toContainText('New moon:');
      // The phase may still say New moon, but the centered event label belongs only to its assigned row.
      expect(
        await page.evaluate(() => {
          const a = window.__npa!;
          const y =
            30 +
            a.riverRows.tops[a.S.sel] -
            document.getElementById('scroller')!.scrollTop +
            (a.riverRows.header - 1) / 2;
          return window.riverText.some(
            (t) => t.text.startsWith('New Moon') && Math.abs(t.y - y) <= 6,
          );
        }),
      ).toBe(false);
      await page.locator('#cv').press('ArrowRight');
      await zoom(page, 'Year');
      await painted(page);
      expect(await page.locator('#scroller').evaluate((el) => el.scrollTop)).toBe(0);
      expect(
        await page.locator('#scroller').evaluate((el) => el.scrollHeight - el.clientHeight),
      ).toBeLessThanOrEqual(1);
      const year = await page.evaluate(() => {
        const a = window.__npa!;
        return {
          ticks: window.riverNewMoonTicks,
          centers: a.nights.flatMap((n, i) =>
            n.quarter === 0 ? [30 + a.riverRows.tops[i] + a.riverRows.heights[i] / 2] : [],
          ),
          labels: window.riverText.filter((t) => t.text.startsWith('New Moon')),
          dates: window.riverText.filter((t) => t.left === 8 && t.y >= 30),
          totals: a.nights.map((n) => n.mfMs),
        };
      });
      expect(year.ticks).toHaveLength(year.centers.length);
      expect(year.ticks.length).toBeGreaterThanOrEqual(13);
      year.ticks.forEach((tick, i) =>
        expect(Math.abs(tick.top + 1 - year.centers[i])).toBeLessThanOrEqual(0.5),
      );
      expect(year.labels).toEqual([]);
      for (const date of year.dates) expect(date.right).toBeLessThanOrEqual(year.ticks[0].left - 2);
      expect(year.totals).toEqual(event.totals);
      await expect(readout).toContainText(eventText);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-new-moon-year-${width}.png`,
          fullPage: true,
        });
      await page.locator('#viewSeg').getByRole('button', { name: 'Calendar', exact: true }).click();
      await expect(page.locator('#riverMoonKey')).toHaveCount(0);
    });

    test(`new-moon labels also fit over summer twilight at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
      await seedPersonal(page, {
        site: {
          name: 'Twilight check',
          lat: 60,
          lon: 0,
          tz: 'Europe/London',
        },
      });
      await openRiver(page);
      await page.evaluate(() => {
        const a = window.__npa!;
        a.select(
          a.nights.findIndex((n) => n.quarter === 0 && n.m === 6),
          true,
          true,
        );
      });
      await painted(page);
      expect(await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].tdMs)).toBe(0);
      const labels = await page.evaluate(() => {
        const a = window.__npa!;
        const cy =
          30 +
          a.riverRows.tops[a.S.sel] -
          document.getElementById('scroller')!.scrollTop +
          (a.riverRows.heights[a.S.sel] - 1) / 2;
        return window.riverText.filter(
          (t) =>
            Math.abs(t.y - cy) <= 6 && (t.text.startsWith('New Moon') || /^Jun \d+,/.test(t.text)),
        );
      });
      expect(labels).toHaveLength(width === 390 ? 2 : 1);
      const canvasWidth = await page.locator('#cv').evaluate((e) => e.clientWidth);
      for (const label of labels) {
        expect(label.left).toBeGreaterThanOrEqual(width === 390 ? 82 : 100);
        expect(label.right).toBeLessThanOrEqual(canvasWidth - (width === 390 ? 96 : 224));
      }
      await expect(page.locator('#riverReadout')).toContainText('New moon:');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-new-moon-twilight-${width}.png`,
          fullPage: true,
        });
    });
  }
});
