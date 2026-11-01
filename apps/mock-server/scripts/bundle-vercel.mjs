/**
 * Bundles the Vercel serverless entrypoint into a single self-contained ESM file.
 *
 * Express and its transitive deps are CommonJS and call `require()` at runtime.
 * Native ES modules have no `require`, so we inject one via `createRequire`.
 * Without this banner the function crashes on cold start with:
 *   "Dynamic require of "path" is not supported"
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = resolve(pkgDir, 'api/index.js');
const rootCopy = resolve(pkgDir, '../../api/index.js');

await build({
  entryPoints: [resolve(pkgDir, 'src/vercel.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile,
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

// Mirror the bundle to the monorepo root so Vercel works with either Root Directory setting.
mkdirSync(dirname(rootCopy), { recursive: true });
copyFileSync(outfile, rootCopy);
console.log(`Copied serverless bundle -> ${rootCopy}`);

