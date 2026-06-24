import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewChecked,
  Directive,
  ElementRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { injectDocsConfig } from '@analogjs/docs';

/**
 * Adds a "Copy" button to every <pre> code block under the host
 * element, idempotent (skips blocks that already have one).
 * Also wraps each h2/h3 with a hover-revealed anchor link, hydrates
 * doc-tabs, and rewrites relative/anchor markdown links so they
 * resolve against the current page and preserve the active locale.
 */
@Directive({
  selector: '[docsEnhanceCode]',
})
export class EnhanceCode implements AfterViewChecked {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly config = injectDocsConfig();

  ngAfterViewChecked(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.attachCopyButtons();
    this.attachHeadingAnchors();
    this.attachTabs();
    this.normalizeLinks();
  }

  private attachCopyButtons(): void {
    const blocks = this.host.nativeElement.querySelectorAll<HTMLPreElement>(
      'pre:not([data-copy-attached="true"])',
    );
    blocks.forEach((pre) => {
      pre.dataset['copyAttached'] = 'true';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.innerText ?? pre.innerText;
        try {
          await navigator.clipboard.writeText(code);
          btn.dataset['copied'] = 'true';
          btn.textContent = 'Copied';
          setTimeout(() => {
            btn.removeAttribute('data-copied');
            btn.textContent = 'Copy';
          }, 1500);
        } catch {
          /* clipboard blocked — silent */
        }
      });
      pre.appendChild(btn);
    });
  }

  private attachTabs(): void {
    const containers = this.host.nativeElement.querySelectorAll<HTMLElement>(
      '.doc-tabs[data-tabs]:not([data-tabs-hydrated="true"])',
    );
    containers.forEach((container) => {
      container.dataset['tabsHydrated'] = 'true';
      const triggers = Array.from(
        container.querySelectorAll<HTMLButtonElement>('.doc-tabs-trigger'),
      );
      const panels = Array.from(
        container.querySelectorAll<HTMLElement>(':scope > .doc-tab'),
      );
      triggers.forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset['index']);
          triggers.forEach((b) => b.removeAttribute('data-active'));
          btn.dataset['active'] = 'true';
          panels.forEach((p, i) => {
            if (i === idx) p.removeAttribute('hidden');
            else p.setAttribute('hidden', '');
          });
        });
      });
    });
  }

  private normalizeLinks(): void {
    const links = this.host.nativeElement.querySelectorAll<HTMLAnchorElement>(
      'analog-markdown a[href]:not([data-href-normalized])',
    );
    if (links.length === 0) return;
    const path = window.location.pathname.replace(/\/$/, '');
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

    const indexedLocales =
      this.config.locales?.indexed ??
      this.config.locales?.list?.map((l) => l.code) ??
      [];
    const defaultLocale = this.config.locales?.default ?? 'en';
    const nonDefault = indexedLocales.filter((c) => c !== defaultLocale);
    const localePrefix = (() => {
      if (nonDefault.length === 0) return '';
      const re = new RegExp(`^/(${nonDefault.join('|')})(?=/|$)`);
      const m = path.match(re);
      return m ? m[0] : '';
    })();

    links.forEach((a) => {
      a.dataset['hrefNormalized'] = 'true';
      const raw = a.getAttribute('href') ?? '';
      if (!raw) return;

      if (/^([a-z]+:|\/\/)/i.test(raw)) return;

      if (raw.startsWith('#')) {
        a.setAttribute('href', `${path}${raw}`);
        return;
      }
      if (raw.startsWith('./')) {
        a.setAttribute('href', `${dir}/${raw.slice(2)}`);
        return;
      }
      if (raw.startsWith('../')) {
        const segments = dir.split('/').filter(Boolean);
        let rest = raw;
        while (rest.startsWith('../')) {
          segments.pop();
          rest = rest.slice(3);
        }
        a.setAttribute(
          'href',
          '/' + [...segments, rest].filter(Boolean).join('/'),
        );
        return;
      }
      if (raw.startsWith('/docs/') || raw === '/docs') {
        if (localePrefix && !raw.startsWith(`${localePrefix}/`)) {
          a.setAttribute('href', `${localePrefix}${raw}`);
        }
        return;
      }
      if (raw.startsWith('/')) return;

      a.setAttribute('href', `${dir}/${raw}`);
    });

    this.repairOrphanAnchors();
  }

  /**
   * Translated docs often keep the original English `#anchor` slug even
   * though the actual heading was translated and now slugs differently.
   * Walk anchor links whose target id is not on the page and try to
   * repair them by matching the link's visible text against heading text.
   */
  private repairOrphanAnchors(): void {
    const article = this.host.nativeElement;
    const headings = Array.from(
      article.querySelectorAll<HTMLElement>(
        'analog-markdown h2[id], analog-markdown h3[id]',
      ),
    );
    if (headings.length === 0) return;
    const byNormalizedText = new Map<string, string>();
    for (const h of headings) {
      const clone = h.cloneNode(true) as HTMLElement;
      clone.querySelector('.heading-anchor')?.remove();
      const norm = (clone.textContent ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      if (norm && !byNormalizedText.has(norm)) {
        byNormalizedText.set(norm, h.id);
      }
    }

    const candidates = article.querySelectorAll<HTMLAnchorElement>(
      'analog-markdown a[href*="#"]:not([data-anchor-repaired])',
    );
    candidates.forEach((a) => {
      a.dataset['anchorRepaired'] = 'true';
      const href = a.getAttribute('href') ?? '';
      const hashIdx = href.indexOf('#');
      if (hashIdx < 0) return;
      const targetId = decodeURIComponent(href.slice(hashIdx + 1));
      if (!targetId) return;
      if (article.querySelector(`#${cssEscape(targetId)}`)) return;
      const linkText = (a.textContent ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      const matched = byNormalizedText.get(linkText);
      if (matched) {
        a.setAttribute('href', `${href.slice(0, hashIdx)}#${matched}`);
      }
    });
  }

  private attachHeadingAnchors(): void {
    const headings = this.host.nativeElement.querySelectorAll<HTMLElement>(
      'h2:not([data-anchor-attached]), h3:not([data-anchor-attached])',
    );
    headings.forEach((h) => {
      if (!h.id) {
        h.id = (h.textContent ?? '')
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-');
      }
      h.dataset['anchorAttached'] = 'true';
      const a = document.createElement('a');
      a.className = 'heading-anchor';
      a.href = `#${h.id}`;
      a.textContent = '#';
      a.setAttribute('aria-label', 'Anchor link');
      h.insertBefore(a, h.firstChild);
    });
  }
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
