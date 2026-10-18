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
        viewport: { width: 1512, height: 920 },
        colorScheme: 'light',
      },
    },
  ],
  // Test the production build, served the way it will be deployed.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
