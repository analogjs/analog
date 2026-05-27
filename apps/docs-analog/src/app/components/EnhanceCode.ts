import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewChecked,
  Directive,
  ElementRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';

/**
 * Adds a "Copy" button to every <pre> code block under the host
 * element, idempotent (skips blocks that already have one).
 * Also wraps each h2/h3 with a hover-revealed anchor link.
 */
@Directive({
  selector: '[docsEnhanceCode]',
})
export class EnhanceCode implements AfterViewChecked {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);

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

  /**
   * Rewrites markdown-rendered relative + anchor-only hrefs so they
   * resolve from the current page, not from <base href="/"> which
   * silently strips them to root. Runs on every change since marked
   * may add new links.
   */
  private normalizeLinks(): void {
    const links = this.host.nativeElement.querySelectorAll<HTMLAnchorElement>(
      'analog-markdown a[href]:not([data-href-normalized])',
    );
    if (links.length === 0) return;
    const path = window.location.pathname.replace(/\/$/, '');
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    links.forEach((a) => {
      a.dataset['hrefNormalized'] = 'true';
      const raw = a.getAttribute('href') ?? '';
      if (!raw || /^([a-z]+:|\/\/|\/)/i.test(raw)) return;
      if (raw.startsWith('#')) {
        a.setAttribute('href', `${path}${raw}`);
      } else if (raw.startsWith('./')) {
        a.setAttribute('href', `${dir}/${raw.slice(2)}`);
      } else if (raw.startsWith('../')) {
        // simple ../ resolution against current dir
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
      } else {
        // plain "overview" with no leading marker — treat as sibling
        a.setAttribute('href', `${dir}/${raw}`);
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
