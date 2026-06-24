import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';

export type Heading = { level: number; text: string; id: string };

/**
 * Extract h2/h3 entries from a rendered markdown HTML string.
 * Mirrors what Toc.collectHeadings produces from the live DOM, but
 * runs synchronously on both server and client so the SSR snapshot
 * can include a populated TOC.
 */
export function extractHeadings(html: string): Heading[] {
  const re = /<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  const out: Heading[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = m[3].replace(/<[^>]*>/g, '').trim();
    if (text) out.push({ level: Number(m[1]), text, id: m[2] });
  }
  return out;
}

const HEADING_SELECTOR = 'h2, h3';

@Component({
  selector: 'docs-toc',
  template: `
    @if (headings().length > 0) {
      <nav class="text-sm">
        @if (!hideHeader()) {
          <p
            class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]"
          >
            On this page
          </p>
        }
        <ul class="space-y-1">
          @for (h of headings(); track h.id) {
            <li [style.paddingLeft.px]="(h.level - 2) * 12">
              <a
                [href]="pathname() + '#' + h.id"
                (click)="scrollTo($event, h.id)"
                class="block py-1 text-[var(--fg-muted)] hover:text-[var(--brand)]"
                [class.font-semibold]="active() === h.id"
                [style.color]="active() === h.id ? 'var(--brand)' : null"
                >{{ h.text }}</a
              >
            </li>
          }
        </ul>
      </nav>
    }
  `,
})
export class Toc implements AfterViewInit, OnDestroy {
  readonly articleRef = input.required<ElementRef<HTMLElement>>();
  readonly hideHeader = input(false);
  /**
   * Optional pre-computed headings (extracted from the rendered markdown
   * string by the parent). When provided, the TOC renders these
   * immediately on SSR so the right rail isn't empty before hydration.
   */
  readonly initialHeadings = input<readonly Heading[]>([]);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly router = inject(Router);

  protected readonly headings = signal<readonly Heading[]>([]);
  protected readonly active = signal<string | null>(null);
  protected readonly pathname = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url.split('?')[0].split('#')[0]),
      startWith(this.router.url.split('?')[0].split('#')[0]),
    ),
    { initialValue: this.router.url.split('?')[0].split('#')[0] },
  );

  private mutationObserver?: MutationObserver;
  private intersectionObserver?: IntersectionObserver;

  constructor() {
    // Mirror the parent's pre-parsed headings into the signal so SSR
    // renders a populated TOC. On the client, ngAfterViewInit overwrites
    // from the live DOM after first paint to pick up any post-render IDs
    // assigned by EnhanceCode.
    effect(() => {
      const initial = this.initialHeadings();
      this.headings.set(initial);
      // Default the active highlight to the first heading so the SSR
      // snapshot matches a fresh "scrolled to top" load. The
      // IntersectionObserver overrides this once the user scrolls.
      if (initial.length > 0) {
        this.active.set(initial[0].id);
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    const el = this.articleRef().nativeElement;
    this.collectHeadings(el);
    this.watchHeadings(el);
    this.mutationObserver = new MutationObserver(() => {
      this.collectHeadings(el);
      this.watchHeadings(el);
    });
    this.mutationObserver.observe(el, { childList: true, subtree: true });
  }

  ngOnDestroy(): void {
    this.mutationObserver?.disconnect();
    this.intersectionObserver?.disconnect();
  }

  protected scrollTo(event: MouseEvent, id: string): void {
    event.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      // Include the pathname so <base href="/"> doesn't clobber the
      // URL to /#id when we only pass the fragment.
      history.replaceState(null, '', `${window.location.pathname}#${id}`);
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  private collectHeadings(article: HTMLElement): void {
    const els = Array.from(
      article.querySelectorAll<HTMLElement>(HEADING_SELECTOR),
    );
    const list: Heading[] = els.map((h) => {
      const text = headingText(h);
      if (!h.id) {
        h.id = text
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-');
      }
      return {
        level: Number(h.tagName.substring(1)),
        text,
        id: h.id,
      };
    });
    this.headings.set(list);
  }

  private watchHeadings(article: HTMLElement): void {
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (top) this.active.set(top.target.id);
      },
      { rootMargin: '0px 0px -60% 0px', threshold: [0, 1] },
    );
    article
      .querySelectorAll<HTMLElement>(HEADING_SELECTOR)
      .forEach((h) => this.intersectionObserver!.observe(h));
  }
}

/**
 * Read a heading's visible text without the `#` anchor that
 * EnhanceCode prepends to every h2/h3.
 */
function headingText(h: HTMLElement): string {
  const clone = h.cloneNode(true) as HTMLElement;
  clone.querySelector('.heading-anchor')?.remove();
  return (clone.textContent ?? '').trim();
}
