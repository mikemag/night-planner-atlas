// Night Planner Atlas · Copyright (C) 2026 Mike Magruder · SPDX-License-Identifier: AGPL-3.0-only
// Capture the current production build without touching personal browser data or docs/images.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../test-results/readme/', import.meta.url);
const now = new Date('2026-09-07T01:00:00Z'); // September 6, 6 PM at the Seattle starter site.
const examples = [
  { file: 'river-month', view: 'river', expanded: true },
  { file: 'calendar-month', view: 'calendar' },
  { file: 'lunations', view: 'lunations' },
  { file: 'dark-weekends', view: 'weekends' },
  { file: 'river-year', view: 'river', riverZoom: 'year', theme: 'dark' },
];

await mkdir(output, { recursive: true });
const server = await preview({
  root,
  preview: { host: '127.0.0.1', port: 4175, strictPort: true, open: false },
});
let browser;
try {
  browser = await chromium.launch();
  for (const example of examples) {
    // A fresh context uses the bundled public starter sites, without inherited saved settings.
    const page = await browser.newPage({
      viewport: { width: 1500, height: 900 },
      deviceScaleFactor: 2,
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles',
      colorScheme: example.theme ?? 'light',
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.setFixedTime(now);
    const plan = new URLSearchParams({
      npa: '1',
      start: '2026-01',
      range: 'year',
      view: example.view,
      night: '2026-09-06',
      focus: '0',
      moonAlt: '0',
      crescent: '0',
      riverZoom: example.riverZoom ?? 'month',
      calZoom: 'month',
      ...(example.expanded ? { expanded: '1' } : {}),
    });
    await page.goto(`http://127.0.0.1:4175/#${plan}`);
    await page.waitForFunction(
      () => window.__npa?.nights.length === 365 && window.__npa.pendingNights === 0,
      undefined,
      { timeout: 30_000 },
    );
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteSel option:checked')).toHaveText('Seattle, Paramount Park');
    await expect(page.locator('#sharedNotice')).toBeHidden();
    if (example.expanded) await expect(page.locator('#riverDetail')).toBeVisible();
    if (example.view === 'weekends') {
      const cycle = page.locator('#darkWeekends').getByRole('article', { name: 'Sep 10, 2026' });
      const comparison = cycle.locator('.trip-compare');
      if (!(await comparison.evaluate((element) => element.open)))
        await comparison.locator(':scope > summary').click();
      await cycle.scrollIntoViewIfNeeded();
    }
    // Leave controls unfocused and clear pointer readouts, then wait for the final canvas paint.
    await page.mouse.move(0, 0);
    await page.evaluate(async () => {
      document.activeElement?.blur();
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1500);
    expect(errors).toEqual([]);
    const path = fileURLToPath(new URL(`${example.file}.png`, output));
    await page.screenshot({ path, animations: 'disabled' });
    console.log(path);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
