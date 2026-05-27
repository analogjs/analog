import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { Plugin } from 'vite';

const SITE_URL = 'https://analogjs.org';
const SUPPORTED_LOCALES = ['de', 'es', 'pt-br', 'zh-hans'] as const;
const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

interface DocEntry {
  slug: string;
  locales: Set<string>; // 'en' or any of SUPPORTED_LOCALES that have a translation
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

/**
 * Emits a sitemap.xml with <xhtml:link rel="alternate" hreflang="...">
 * entries for every locale that has a translation of each doc.
 */
export function sitemapPlugin(): Plugin {
  return {
    name: 'docs-analog:sitemap',
    apply: 'build',
    closeBundle() {
      const contentDir = resolve(__dirname, '../content');
      const outDir = resolve(
        __dirname,
        '../../../../dist/apps/docs-analog/client',
      );

      const entries = new Map<string, DocEntry>();
      for (const file of walk(contentDir)) {
        const rel = relative(contentDir, file).replace(/\.md$/, '');
        const parts = rel.split('/');
        let locale: string | null = null;
        let slug = rel;
        if (LOCALE_SET.has(parts[0])) {
          locale = parts[0];
          slug = parts.slice(1).join('/');
        }
        if (!slug) continue;
        const entry = entries.get(slug) ?? { slug, locales: new Set<string>() };
        entry.locales.add(locale ?? 'en');
        entries.set(slug, entry);
      }

      const urls: string[] = [];
      for (const entry of entries.values()) {
        const localesInOrder = [
          ...(entry.locales.has('en') ? ['en'] : []),
          ...SUPPORTED_LOCALES.filter((l) => entry.locales.has(l)),
        ];
        for (const loc of localesInOrder) {
          const href =
            loc === 'en'
              ? `${SITE_URL}/docs/${entry.slug}`
              : `${SITE_URL}/${loc}/docs/${entry.slug}`;
          const alternates = localesInOrder
            .map(
              (al) =>
                `    <xhtml:link rel="alternate" hreflang="${al}" href="${
                  al === 'en'
                    ? `${SITE_URL}/docs/${entry.slug}`
                    : `${SITE_URL}/${al}/docs/${entry.slug}`
                }"/>`,
            )
            .join('\n');
          urls.push(`  <url>\n    <loc>${href}</loc>\n${alternates}\n  </url>`);
        }
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;

      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, 'sitemap.xml'), xml, 'utf8');
      this.info?.(`sitemap.xml: ${entries.size} docs, ${urls.length} URLs`);
    },
  };
}
