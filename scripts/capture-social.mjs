// Night Planner Atlas · Copyright (C) 2026 Mike Magruder · SPDX-License-Identifier: AGPL-3.0-only
// Render a sharing card from the current build and a public example, without personal storage.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../test-results/social-preview.png', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
const server = await preview({
  root,
  preview: { host: '127.0.0.1', port: 4176, strictPort: true, open: false },
});
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-09-07T01:00:00Z'));
  const plan = new URLSearchParams({
    npa: '1',
    start: '2026-01',
    range: 'year',
    view: 'river',
    night: '2026-09-06',
    focus: '0',
    moonAlt: '0',
    crescent: '0',
    riverZoom: 'month',
  });
  await page.goto(`http://127.0.0.1:4176/#${plan}`);
  await page.waitForFunction(
    () => window.__npa?.nights.length === 365 && window.__npa.pendingNights === 0,
    undefined,
    { timeout: 30_000 },
  );
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteSel option:checked')).toHaveText('Seattle, Paramount Park');
  await expect(page.locator('#sharedNotice')).toBeHidden();
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    document.activeElement?.blur();
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  expect(errors).toEqual([]);
  const bounds = await page.locator('#stage').boundingBox();
  if (!bounds) throw new Error('River chart is not visible.');
  const chart = await page.screenshot({
    clip: { ...bounds, height: 390 },
    animations: 'disabled',
  });
  const card = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await card.setContent(`<!doctype html>
    <html lang="en"><meta charset="utf-8"><title>Night Planner Atlas sharing card</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; width: 1200px; height: 630px; padding: 36px 48px;
        background: #0b1020; color: #edf1f8; font-family: system-ui, sans-serif; }
      h1 { margin: 0; font-size: 56px; font-weight: 720; letter-spacing: -1.8px; line-height: 1.15; }
      .tagline { margin: 12px 0 30px; font-size: 28px; color: #b9c8e2; }
      img { display: block; width: 1104px; height: 369px; object-fit: cover;
        object-position: top; border: 1px solid #3b455c; border-radius: 12px; }
      footer { display: flex; justify-content: space-between; margin-top: 22px;
        font-size: 20px; color: #b9c8e2; }
      .address { color: #edf1f8; }
    </style><body>
      <h1>Night Planner Atlas</h1>
      <p class="tagline">Find your next dark-sky night.</p>
      <img src="data:image/png;base64,${chart.toString('base64')}"
        alt="River chart for September 2026 at Seattle">
      <footer><span>Twilight · Moonlight · Usable dark</span>
        <span class="address">night-planner-atlas.web.app</span></footer>
    </body></html>`);
  await card.locator('img').evaluate((img) => img.decode());
  await card.evaluate(() => document.fonts.ready);
  expect(await card.evaluate(() => document.documentElement.scrollHeight)).toBe(630);
  await card.screenshot({ path: fileURLToPath(output), animations: 'disabled' });
  console.log(fileURLToPath(output));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
