import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs, so the built site works from any path.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    // Keep license headers (e.g. Astronomy Engine's MIT notice) in the minified bundle.
    rolldownOptions: { output: { comments: { legal: true } } },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
