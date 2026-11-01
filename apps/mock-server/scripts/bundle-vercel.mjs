/**
 * Bundles the Vercel serverless entrypoint into a single self-contained CommonJS file.
 *
 * Outputting CommonJS (`format: 'cjs'`) provides native `require()` for Express and
 * its dependencies with zero ESM dynamic-require issues, and unwraps `module.exports`
 * so both `require()` and `import()` receive the callable Express `app` directly.
 */
import { build } from 'esbuild';
import { appendFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = resolve(pkgDir, 'api/index.js');
const distIndex = resolve(pkgDir, 'dist/index.js');
const rootCopy = resolve(pkgDir, '../../api/index.js');

const cjsUnwrapFooter =
  '\nif (typeof module !== "undefined" && module.exports && typeof module.exports.default === "function") { const fn = module.exports.default; Object.assign(fn, module.exports); module.exports = fn; }\n';

await build({
  entryPoints: [resolve(pkgDir, 'src/vercel.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile,
  footer: {
    js: cjsUnwrapFooter,
  },
  logLevel: 'info',
});

if (existsSync(distIndex)) {
  appendFileSync(distIndex, cjsUnwrapFooter);
}

mkdirSync(dirname(rootCopy), { recursive: true });
copyFileSync(outfile, rootCopy);
console.log(`Copied serverless CJS bundle -> ${rootCopy}`);
