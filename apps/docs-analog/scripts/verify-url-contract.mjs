#!/usr/bin/env node
/**
 * URL-contract verifier.
 *
 * Walks src/content/ to enumerate every URL the site publishes, then
 * HEAD-checks each against the dev or static server. Fails on any
 * non-2xx so changes don't silently break inbound links / SEO.
 *
 * Usage:
 *   node apps/docs-analog/scripts/verify-url-contract.mjs http://localhost:5173
 *   node apps/docs-analog/scripts/verify-url-contract.mjs https://analogjs.org
 *
 * Pass --agent-surface to also verify the machine-readable contract (real
 * 404s, JSON API + errors, markdown content negotiation with Vary: Accept).
 * Only meaningful against the deployed nginx config or a matching server —
 * the vite dev server does not implement these semantics.
 */

import { readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const agentSurface = args.includes('--agent-surface');
const baseUrl = (
  args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173'
).replace(/\/$/, '');
const contentDir = resolve(__dirname, '../src/content');
const LOCALES = new Set(['de', 'es', 'fr', 'ko', 'pt-br', 'tr', 'zh-hans']);

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

// Static pages and machine-readable files that must always resolve.
urls.push(
  '/',
  '/about',
  '/contact',
  '/developers',
  '/privacy',
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap.xml',
  '/robots.txt',
  '/openapi.json',
  '/api/v1/docs.json',
  '/api/v1/docs/introduction.json',
  '/docs/introduction.md',
  '/index.md',
  '/about.md',
  '/contact.md',
  '/developers.md',
  '/privacy.md',
);

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

// Machine contract: real 404s, JSON errors, markdown negotiation.
if (agentSurface) {
  const checks = [
    {
      name: 'unknown path returns 404',
      run: async () => {
        const res = await fetch(`${baseUrl}/this-path-does-not-exist-xyz`);
        if (res.status !== 404) return `expected 404, got ${res.status}`;
        return null;
      },
    },
    {
      name: 'unknown /api/ path returns structured JSON 404',
      run: async () => {
        const res = await fetch(`${baseUrl}/api/v1/docs/nope-xyz.json`);
        if (res.status !== 404) return `expected 404, got ${res.status}`;
        const type = res.headers.get('content-type') ?? '';
        if (!type.includes('application/json'))
          return `expected JSON, got ${type}`;
        const body = await res.json();
        if (body?.error?.code !== 'not_found') return 'missing error.code';
        return null;
      },
    },
    {
      name: 'Accept: text/markdown negotiates markdown with Vary: Accept',
      run: async () => {
        const res = await fetch(`${baseUrl}/docs/introduction`, {
          headers: { accept: 'text/markdown' },
        });
        const type = res.headers.get('content-type') ?? '';
        const vary = res.headers.get('vary') ?? '';
        if (!type.includes('text/markdown'))
          return `expected markdown, got ${type}`;
        if (!/\baccept\b/i.test(vary)) return `Vary missing Accept: "${vary}"`;
        return null;
      },
    },
    {
      name: 'markdown 404 body is markdown',
      run: async () => {
        const res = await fetch(`${baseUrl}/docs/nope-xyz.md`);
        if (res.status !== 404) return `expected 404, got ${res.status}`;
        const type = res.headers.get('content-type') ?? '';
        if (!type.includes('text/markdown'))
          return `expected markdown, got ${type}`;
        return null;
      },
    },
  ];
  for (const check of checks) {
    try {
      const problem = await check.run();
      if (problem) failures.push(`AGENT ${check.name}: ${problem}`);
    } catch (err) {
      failures.push(`AGENT ${check.name}: ${err.message}`);
    }
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
