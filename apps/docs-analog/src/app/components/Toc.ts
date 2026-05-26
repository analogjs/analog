import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

type Heading = { level: number; text: string; id: string };

const HEADING_SELECTOR = 'h2, h3';

@Component({
  selector: 'docs-toc',
  template: `
    @if (headings().length > 0) {
      <nav class="text-xs">
        <p class="mb-2 font-semibold uppercase tracking-wide text-gray-500">
          On this page
        </p>
        <ul class="space-y-1">
          @for (h of headings(); track h.id) {
            <li [style.paddingLeft.px]="(h.level - 2) * 12">
              <a
                [href]="'#' + h.id"
                (click)="scrollTo($event, h.id)"
                class="block py-1 text-gray-600 hover:text-gray-900"
                [class.font-semibold]="active() === h.id"
                [class.text-blue-600]="active() === h.id"
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

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  protected readonly headings = signal<Heading[]>([]);
  protected readonly active = signal<string | null>(null);

  private mutationObserver?: MutationObserver;
  private intersectionObserver?: IntersectionObserver;

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
      history.replaceState(null, '', `#${id}`);
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  private collectHeadings(article: HTMLElement): void {
    const els = Array.from(
      article.querySelectorAll<HTMLElement>(HEADING_SELECTOR),
    );
    const list: Heading[] = els.map((h) => {
      if (!h.id) {
        h.id = (h.textContent ?? '')
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-');
      }
      return {
        level: Number(h.tagName.substring(1)),
        text: h.textContent ?? '',
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
