import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { Plugin } from 'vite';

export interface SitemapOptions {
  /** Public site origin, e.g. `https://analogjs.org`. No trailing slash. */
  siteUrl: string;
  /** Absolute path to the content root that holds `<slug>.md` and `<locale>/<slug>.md`. */
  contentDir: string;
  /** Absolute path to the prerendered client dist directory (sitemap.xml is written here). */
  distDir: string;
  /** Locale served at the unprefixed `/docs/<slug>` path. Defaults to `en`. */
  defaultLocale?: string;
  /** Non-default locale codes served at `/<code>/docs/<slug>`. */
  locales: ReadonlyArray<string>;
}

interface DocEntry {
  slug: string;
  /** Set of locale codes that have a translation (includes the default). */
  locales: Set<string>;
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
 * Emits a sitemap.xml with `<xhtml:link rel="alternate" hreflang="...">`
 * entries for every locale that has a translation of each doc.
 */
export function sitemapPlugin(options: SitemapOptions): Plugin {
  const {
    siteUrl,
    contentDir,
    distDir,
    defaultLocale = 'en',
    locales,
  } = options;
  const localeSet = new Set<string>(locales);

  const url = (locale: string, slug: string): string =>
    locale === defaultLocale
      ? `${siteUrl}/docs/${slug}`
      : `${siteUrl}/${locale}/docs/${slug}`;

  return {
    name: '@analogjs/content:sitemap',
    apply: 'build',
    closeBundle() {
      const entries = new Map<string, DocEntry>();
      for (const file of walk(contentDir)) {
        const rel = relative(contentDir, file).replace(/\.md$/, '');
        const parts = rel.split('/');
        let locale: string = defaultLocale;
        let slug = rel;
        if (localeSet.has(parts[0])) {
          locale = parts[0];
          slug = parts.slice(1).join('/');
        }
        if (!slug) continue;
        const entry = entries.get(slug) ?? { slug, locales: new Set<string>() };
        entry.locales.add(locale);
        entries.set(slug, entry);
      }

      const urls: string[] = [];
      for (const entry of entries.values()) {
        const localesInOrder = [
          ...(entry.locales.has(defaultLocale) ? [defaultLocale] : []),
          ...locales.filter((l) => entry.locales.has(l)),
        ];
        for (const loc of localesInOrder) {
          const href = url(loc, entry.slug);
          const alternates = localesInOrder
            .map(
              (al) =>
                `    <xhtml:link rel="alternate" hreflang="${al}" href="${url(al, entry.slug)}"/>`,
            )
            .join('\n');
          urls.push(`  <url>\n    <loc>${href}</loc>\n${alternates}\n  </url>`);
        }
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;

      mkdirSync(distDir, { recursive: true });
      writeFileSync(resolve(distDir, 'sitemap.xml'), xml, 'utf8');
      this.info?.(`sitemap.xml: ${entries.size} docs, ${urls.length} URLs`);
    },
  };
}
