import { defineConfig } from 'vitest/config';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const inputs = readdirSync(root + 'src/model', { recursive: true })
  .map(String)
  .filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.startsWith('testdata/'))
  .map((p) => 'src/model/' + p)
  .concat('src/app/night-cache-format.ts')
  .sort();
const hash = createHash('sha256');
for (const path of inputs) hash.update(path).update(readFileSync(root + path));
const lock = JSON.parse(readFileSync(root + 'package-lock.json', 'utf8'));
hash.update(JSON.stringify(lock.packages['node_modules/astronomy-engine']));
hash.update(readFileSync(root + 'node_modules/astronomy-engine/package.json'));
const computeRevision = hash.digest('hex').slice(0, 20);

export default defineConfig({
  define: { __NPA_COMPUTE_REVISION__: JSON.stringify(computeRevision) },
  // Relative asset URLs, so the built site works from any path.
  base: './',
  // Public license texts are also embedded verbatim in the offline guide.
  assetsInclude: ['**/licenses/*.txt'],
  build: {
    target: 'es2022',
    sourcemap: true,
    // Keep license headers (e.g. Astronomy Engine's MIT notice) in the minified bundle.
    rolldownOptions: { output: { comments: { legal: true } } },
  },
  worker: {
    rolldownOptions: { output: { comments: { legal: true } } },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
