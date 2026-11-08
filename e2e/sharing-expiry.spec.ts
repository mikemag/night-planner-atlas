import { expect, test, type Page } from '@playwright/test';
import { createSiteLink } from '../src/app/share-state';
import { readPersonal } from './storage';

const NOW = new Date('2026-10-28T22:00:00Z');
const site = {
  name: 'Undo countdown test site',
  lat: 45,
  lon: -120,
  tz: 'America/Los_Angeles',
  elevation: 500,
};

async function openInvitation(page: Page, baseURL: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(createSiteLink(baseURL, site));
  await page.mouse.move(0, 0);
}

// Playwright keeps its pages active even when another test tab is selected. Deliver the
// browser's visibility/focus state and events explicitly, without a real-time 12-second wait.
async function activity(page: Page, visible: boolean, focused: boolean) {
  await page.evaluate(
    ({ visible, focused }) => {
      Object.defineProperties(document, {
        hidden: { configurable: true, get: () => !visible },
        visibilityState: { configurable: true, get: () => (visible ? 'visible' : 'hidden') },
        hasFocus: { configurable: true, value: () => focused },
      });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event(focused ? 'focus' : 'blur'));
    },
    { visible, focused },
  );
}

test('a slow initial load preserves the shared-site Undo action', async ({ page, baseURL }) => {
  await openInvitation(page, baseURL!);
  await expect(page.locator('#loading')).toBeVisible();
  await expect(page.locator('#shareAction')).toHaveText('Undo');
  // Move beyond the old notice deadline while the initial calculation is in progress.
  await page.clock.fastForward(20_000);
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#sharedNotice')).toBeVisible();
  expect((await readPersonal(page)).sites.some((saved) => saved.name === site.name)).toBe(true);
  await page.locator('#shareAction').click();
  await expect(page.locator('#sharedNoticeText')).toContainText('removed from saved sites');
  expect((await readPersonal(page)).sites.some((saved) => saved.name === site.name)).toBe(false);
});

test('Undo pauses in hidden tabs and inactive windows, then uses its remaining active time', async ({
  page,
  baseURL,
}) => {
  await openInvitation(page, baseURL!);
  await expect(page.locator('#loading')).toBeHidden();
  await page.clock.pauseAt(NOW);
  await page.clock.runFor(4_000);

  await activity(page, false, false);
  await page.clock.runFor(60_000);
  await expect(page.locator('#sharedNotice')).toBeVisible();
  await activity(page, true, false);
  await page.clock.runFor(60_000);
  await expect(page.locator('#sharedNotice')).toBeVisible();

  await activity(page, true, true);
  await page.clock.runFor(7_000);
  await expect(page.locator('#sharedNotice')).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(page.locator('#sharedNotice')).toBeHidden();
  await activity(page, false, false);
  await activity(page, true, true);
  await expect(page.locator('#sharedNotice')).toBeHidden();
});

test('Undo keeps its remaining time through hover, keyboard focus, and a later calculation', async ({
  page,
  baseURL,
}) => {
  await openInvitation(page, baseURL!);
  await expect(page.locator('#loading')).toBeHidden();
  await page.clock.pauseAt(NOW);
  await page.locator('#sharedNotice').hover();
  await page.clock.runFor(60_000);
  await expect(page.locator('#sharedNotice')).toBeVisible();
  await page.mouse.move(0, 0);
  await page.locator('#shareAction').focus();
  await page.clock.runFor(60_000);
  await expect(page.locator('#sharedNotice')).toBeVisible();
  await page.locator('#cv').focus();
  await page.clock.runFor(4_000);

  await page.clock.resume();
  await page.locator('#rangeNext').click();
  await expect(page.locator('#loading')).toBeVisible();
  await page.clock.fastForward(30_000);
  await expect(page.locator('#loading')).toBeHidden();
  await page.clock.pauseAt(NOW);
  await page.clock.runFor(7_000);
  await expect(page.locator('#sharedNotice')).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(page.locator('#sharedNotice')).toBeHidden();
});
