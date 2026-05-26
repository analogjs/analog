import { AsyncPipe } from '@angular/common';
import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs/operators';
import { injectContent, MarkdownComponent } from '@analogjs/content';
import { DocFooter } from '../../components/DocFooter';
import { Toc } from '../../components/Toc';

interface DocAttributes {
  title?: string;
  description?: string;
}

@Component({
  imports: [AsyncPipe, MarkdownComponent, DocFooter, Toc],
  template: `
    <div class="flex gap-12">
      <div #article class="flex-1 min-w-0">
        @if (doc$ | async; as doc) {
          <header class="mb-8">
            @if (doc.attributes.title) {
              <h1 class="text-4xl font-bold tracking-tight">
                {{ doc.attributes.title }}
              </h1>
            }
            @if (doc.attributes.description) {
              <p class="mt-3 text-lg text-gray-600">
                {{ doc.attributes.description }}
              </p>
            }
          </header>
          <analog-markdown class="prose max-w-none" [content]="doc.content" />
          @if (slug(); as s) {
            <docs-doc-footer [slug]="s" />
          }
        }
      </div>
      <aside class="hidden w-56 shrink-0 lg:block">
        <div class="sticky top-8">
          <docs-toc [articleRef]="articleRef()" />
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
    inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('slug') ?? '')),
  );
}
