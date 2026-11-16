import { defineConfig, devices } from '@playwright/test';
import { UI_SPECS } from './e2e/suites';

const PORT = 4174;
const suite = process.env.NPA_E2E_SUITE;
if (suite && !['ui', 'integration'].includes(suite)) throw new Error(`Unknown E2E suite: ${suite}`);

export default defineConfig({
  testDir: 'e2e',
  testMatch: suite === 'ui' ? UI_SPECS : '**/*.spec.ts',
  testIgnore: suite === 'integration' ? UI_SPECS : [],
  fullyParallel: true,
  workers: 2,
  globalSetup: './e2e/global-setup.ts',
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1512, height: 920 },
    // Opt in with --trace=retain-on-failure when diagnosing a failure.
    trace: 'off',
    screenshot: 'only-on-failure',
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
      // Repeat only cases whose initial dark palette adds coverage or a curated capture.
      // Tests that cycle through all themes already cover those palettes in both engines.
      grep: /@dark\b/,
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
    ...(process.env.RETINA
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
