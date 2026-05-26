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
