/**
 * Builds the Lambda handler with esbuild and zips it to dist/lambda.zip.
 * Replicates what SAM's BuildMethod: esbuild did in template.yaml.
 *
 * Output: backend/dist/lambda.zip
 *   └── handler.mjs   (ESM bundle, @aws-sdk/* excluded — provided by runtime)
 */

import { build } from 'esbuild';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, 'dist');

mkdirSync(outDir, { recursive: true });

// 1 — Bundle with esbuild (ESM, arm64-compatible, exclude AWS SDK)
await build({
  entryPoints: ['src/handler.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: `${outDir}/handler.mjs`,
  // mongodb is excluded: Lambda deployments use DynamoDB (DB_DRIVER=dynamodb).
  // If you switch Lambda to MongoDB, remove 'mongodb' from this list.
  external: ['@aws-sdk/*', 'mongodb'],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

console.log('esbuild done → dist/handler.mjs');

// 2 — Zip the bundle (zip is available on Linux/macOS CI runners)
execFileSync('zip', ['-j', `${outDir}/lambda.zip`, `${outDir}/handler.mjs`], {
  stdio: 'inherit',
});

console.log('zip done → dist/lambda.zip');
