import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1512, height: 920 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-light',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1512, height: 920 },
        colorScheme: 'light',
      },
    },
    {
      name: 'chromium-dark',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1512, height: 920 },
        colorScheme: 'dark',
      },
    },
    {
      name: 'webkit-light',
      use: {
        ...devices['Desktop Safari'],
        // Headless Retina WebKit can throttle calculation timers on macOS.
        deviceScaleFactor: 1,
        viewport: { width: 1512, height: 920 },
        colorScheme: 'light',
      },
    },
    ...(process.env.SCREENSHOTS
      ? [
          {
            name: 'webkit-retina',
            grep: /@retina/,
            // Keep a single visible Retina window for the visual checks.
            workers: 1,
            use: {
              ...devices['Desktop Safari'],
              viewport: { width: 1512, height: 920 },
              colorScheme: 'light' as const,
              deviceScaleFactor: 2,
              headless: false,
            },
          },
        ]
      : []),
  ],
  // Test the production build, served the way it will be deployed.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
