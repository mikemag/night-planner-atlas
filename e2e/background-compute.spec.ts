import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  return page.evaluate(() => ({
    nights: JSON.parse(
      JSON.stringify(window.__npa!.nights, (key, value) => (key === 'tz' ? null : value)),
    ),
    count: window.__npa!.calculatedNights,
  }));
}

test('background calculation and sliced fallback produce exactly the same nights', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('nights.worker'))
          this.addEventListener('message', ({ data }) => {
            if (data.night)
              document.documentElement.dataset.backgroundNights = String(
                Number(document.documentElement.dataset.backgroundNights ?? 0) + 1,
              );
          });
      }
    };
  });
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  const background = await open(page);
  expect(workers.filter((url) => url.includes('nights.worker'))).toHaveLength(1);
  expect(background.count).toBe(426);
  await expect(page.locator('html')).toHaveAttribute('data-background-nights', '426');

  // A fresh page with storage unavailable exercises all calculations, not the persisted cache.
  const fallback = await context.newPage();
  await fallback.addInitScript(() => {
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes('nights.worker')) throw new Error('Worker unavailable');
        super(url, options);
      }
    };
    Object.defineProperty(window, 'indexedDB', { get: () => undefined });
  });
  const errors: string[] = [];
  fallback.on('pageerror', (error) => errors.push(error.message));
  expect(await open(fallback)).toEqual(background);
  expect(errors).toEqual([]);
});

test('a worker failure keeps completed nights and resumes without logging private inputs', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('nights.worker')) {
          let received = 0;
          this.addEventListener('message', ({ data }) => {
            if (data.night && ++received === 8)
              this.dispatchEvent(
                new ErrorEvent('error', { cancelable: true, message: 'Private solver details' }),
              );
          });
        }
      }
    };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const result = await open(page);
  expect(result.count).toBe(426);
  expect(errors).toEqual([]);
  const nights = result.nights;
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => window.__npa!.calculatedNights)).toBe(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(
        JSON.stringify(window.__npa!.nights, (key, value) => (key === 'tz' ? null : value)),
      ),
    ),
  ).toEqual(nights);
});
