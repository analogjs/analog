import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Emits `sitemap.xml` into the browser output after a prerendering
 * build, with one entry per prerendered page (directories containing an
 * `index.html`; the CSR fallback document is not a page).
 */
export function emitSitemap(browserDir: string, host: string): string[] {
  const routes = collectPrerenderedRoutes(browserDir).sort();
  writeFileSync(join(browserDir, 'sitemap.xml'), buildSitemapXml(host, routes));
  return routes;
}

export function buildSitemapXml(host: string, routes: string[]): string {
  const base = host.replace(/\/+$/, '');
  const lastmod = new Date().toISOString().split('T')[0];
  const urls = routes
    .map(
      (route) =>
        `  <url>\n` +
        `    <loc>${escapeXml(`${base}${route}`)}</loc>\n` +
        `    <lastmod>${lastmod}</lastmod>\n` +
        `  </url>`,
    )
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls}\n</urlset>\n`
  );
}

function collectPrerenderedRoutes(browserDir: string, prefix = ''): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(join(browserDir, prefix.slice(1) || '.'))) {
    const relative = `${prefix}/${entry}`;
    const absolute = join(browserDir, relative.slice(1));
    if (entry === 'index.html') {
      routes.push(prefix || '/');
    } else if (statSync(absolute).isDirectory()) {
      routes.push(...collectPrerenderedRoutes(browserDir, relative));
    }
  }
  return routes;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');
}
