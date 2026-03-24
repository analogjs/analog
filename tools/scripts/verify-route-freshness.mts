#!/usr/bin/env node

/**
 * Verifies that checked-in routeTree.gen.ts files are fresh.
 *
 * Run this script after build or route generation to detect stale
 * generated route files that no longer match the current route sources.
 *
 * Usage:
 *   node tools/scripts/verify-route-freshness.mts
 *
 * Exit code 1 if any routeTree.gen.ts file has uncommitted changes,
 * meaning the checked-in version was stale relative to the actual routes.
 *
 * Typical CI integration:
 *   pnpm build && node tools/scripts/verify-route-freshness.mts
 */

import { execSync } from 'node:child_process';

const diff = execSync('git diff --name-only -- "**/routeTree.gen.ts"', {
  encoding: 'utf-8',
}).trim();

if (diff) {
  console.error('[Analog] Stale route files detected after generation:');
  for (const file of diff.split('\n')) {
    console.error(`  - ${file}`);
  }
  console.error(
    '\nThe checked-in routeTree.gen.ts files do not match the current route sources.',
  );
  console.error(
    'Regenerate route files (pnpm build) and commit the updated output.',
  );
  process.exit(1);
}

console.log('Route file freshness check passed.');
