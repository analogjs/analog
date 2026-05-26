#!/usr/bin/env node
/**
 * Cutover URL-contract verifier.
 *
 * Walks src/content/ to enumerate every URL the legacy Docusaurus
 * docs-app would have published, then HEAD-checks each against the
 * dev or static server. Fails on any non-2xx so the cutover doesn't
 * silently break inbound links / SEO.
 *
 * Usage:
 *   node apps/docs-analog/scripts/verify-url-contract.mjs http://localhost:5173
 *   node apps/docs-analog/scripts/verify-url-contract.mjs https://analogjs.org
 */

import { readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const baseUrl = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const contentDir = resolve(__dirname, '../src/content');
const LOCALES = new Set([
  'de',
  'es',
  'fr',
  'ko',
  'pt-br',
  'tr',
  'zh-hans',
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

const urls = [];
for (const file of walk(contentDir)) {
  const rel = relative(contentDir, file).replace(/\.md$/, '');
  const parts = rel.split('/');
  if (LOCALES.has(parts[0])) {
    const locale = parts[0];
    const slug = parts.slice(1).join('/');
    if (slug) urls.push(`/${locale}/docs/${slug}`);
  } else {
    urls.push(`/docs/${rel}`);
  }
}

const failures = [];
for (const url of urls) {
  const full = `${baseUrl}${url}`;
  try {
    const res = await fetch(full, { method: 'GET', redirect: 'manual' });
    if (res.status < 200 || res.status >= 300) {
      failures.push(`${res.status} ${url}`);
    }
  } catch (err) {
    failures.push(`ERR  ${url} (${err.message})`);
  }
}

console.log(`checked ${urls.length} URLs against ${baseUrl}`);
if (failures.length > 0) {
  console.error(`\n${failures.length} failed:`);
  for (const f of failures.slice(0, 50)) console.error(`  ${f}`);
  if (failures.length > 50) console.error(`  ... ${failures.length - 50} more`);
  process.exit(1);
}
console.log('all URLs OK ✓');
