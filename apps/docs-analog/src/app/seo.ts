import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { injectContentFilesMap } from '@analogjs/content';
import { flattenSidebar } from '@analogjs/docs';
import { SUPPORTED_LOCALES } from './locale';
import { sidebar } from './sidebar';

const SITE_URL = 'https://analogjs.org';

/**
 * Per-route SEO helper. Inject once in the page component's
 * constructor, then call `apply()` from an effect or wherever the
 * loaded doc attributes become available.
 */
@Injectable({ providedIn: 'root' })
export class DocSeo {
  private readonly meta = inject(Meta);
  private readonly titleSvc = inject(Title);
  private readonly doc = inject(DOCUMENT);
  private readonly filesMap = injectContentFilesMap();

  apply(
    slug: string,
    attrs: { title?: string; description?: string },
    locale: string | null,
    content?: string,
  ): void {
    const title =
      attrs.title ??
      flattenSidebar(sidebar, locale).find((e) => e.id === slug)?.label ??
      firstHeadingOf(content);
    const pageTitle = title ? `${title} | Analog` : 'Analog';
    this.titleSvc.setTitle(pageTitle);

    if (attrs.description) {
      this.meta.updateTag({ name: 'description', content: attrs.description });
      this.meta.updateTag({
        property: 'og:description',
        content: attrs.description,
      });
    }
    this.meta.updateTag({ property: 'og:title', content: pageTitle });

    const head = this.doc.head;
    head
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .forEach((el) => el.remove());

    const filePaths = new Set(Object.keys(this.filesMap));
    const enKey = `/src/content/${slug}.md`;
    if (filePaths.has(enKey)) {
      this.appendAlternate('en', `${SITE_URL}/docs/${slug}`);
      this.appendAlternate('x-default', `${SITE_URL}/docs/${slug}`);
    }
    for (const loc of SUPPORTED_LOCALES) {
      if (filePaths.has(`/src/content/${loc}/${slug}.md`)) {
        this.appendAlternate(loc, `${SITE_URL}/${loc}/docs/${slug}`);
      }
    }

    const canonicalHref = locale
      ? `${SITE_URL}/${locale}/docs/${slug}`
      : `${SITE_URL}/docs/${slug}`;
    let canonical = head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!canonical) {
      canonical = this.doc.createElement('link');
      canonical.rel = 'canonical';
      head.appendChild(canonical);
    }
    canonical.href = canonicalHref;
  }

  private appendAlternate(hreflang: string, href: string): void {
    const link = this.doc.createElement('link');
    link.rel = 'alternate';
    link.setAttribute('hreflang', hreflang);
    link.href = href;
    this.doc.head.appendChild(link);
  }
}

function firstHeadingOf(content: string | undefined): string | undefined {
  if (!content) return undefined;
  const m = /^#\s+(.+)$/m.exec(content);
  return m?.[1].trim();
}
