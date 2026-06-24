import { AsyncPipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs/operators';
import {
  CONTENT_LOCALE,
  injectContent,
  MarkdownComponent,
} from '@analogjs/content';
import {
  DocFooter,
  EnhanceCode,
  extractHeadings,
  Toc,
} from '@analogjs/content/docs/ui';
import { DocSeo } from '../../seo';

interface DocAttributes {
  title?: string;
  description?: string;
}

@Component({
  imports: [AsyncPipe, MarkdownComponent, DocFooter, EnhanceCode, Toc],
  template: `
    <div class="flex gap-8">
      <div #article docsEnhanceCode class="flex-1 min-w-0 min-h-screen">
        @if (doc$ | async; as doc) {
          <header class="mb-6">
            @if (doc.attributes.title) {
              <h1
                class="text-5xl font-bold leading-tight tracking-tight"
                style="letter-spacing: -0.02em"
              >
                {{ doc.attributes.title }}
              </h1>
            }
            @if (doc.attributes.description) {
              <p class="mt-3 text-lg" style="color: var(--fg-muted)">
                {{ doc.attributes.description }}
              </p>
            }
          </header>
          <details
            class="mb-6 rounded border p-3 lg:hidden"
            style="border-color: var(--border)"
          >
            <summary
              class="cursor-pointer text-sm font-semibold uppercase tracking-wide"
              style="color: var(--fg-muted)"
            >
              On this page
            </summary>
            <div class="mt-3">
              <docs-toc
                [articleRef]="articleRef()"
                [initialHeadings]="headings()"
                [hideHeader]="true"
              />
            </div>
          </details>
          <analog-markdown class="prose max-w-none" [content]="doc.content" />
          @if (slug(); as s) {
            <docs-doc-footer [slug]="s" />
          }
        }
      </div>
      <aside class="hidden w-56 shrink-0 lg:block">
        <div
          class="docs-sticky-rail sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto pr-2"
        >
          <docs-toc
            [articleRef]="articleRef()"
            [initialHeadings]="headings()"
          />
        </div>
      </aside>
    </div>
  `,
})
export default class DocPage {
  protected readonly doc$ = injectContent<DocAttributes>('slug');
  protected readonly articleRef =
    viewChild.required<ElementRef<HTMLElement>>('article');
  protected readonly slug = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      // Empty slug == /docs (or /<locale>/docs) root; serve introduction.
      map((p) => p.get('slug') || 'introduction'),
    ),
  );

  private readonly doc = toSignal(this.doc$);
  protected readonly headings = computed(() => {
    const c = this.doc()?.content;
    return typeof c === 'string' ? extractHeadings(c) : [];
  });
  private readonly locale = inject(CONTENT_LOCALE, { optional: true });
  private readonly seo = inject(DocSeo);

  constructor() {
    effect(() => {
      const slug = this.slug();
      const doc = this.doc();
      if (slug && doc) {
        const contentStr =
          typeof doc.content === 'string' ? doc.content : undefined;
        this.seo.apply(slug, doc.attributes, this.locale, contentStr);
      }
    });
  }
}
