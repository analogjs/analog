import { AsyncPipe } from '@angular/common';
import { Component } from '@angular/core';
import { injectContent, MarkdownComponent } from '@analogjs/content';

interface DocAttributes {
  title?: string;
  description?: string;
}

@Component({
  imports: [AsyncPipe, MarkdownComponent],
  template: `
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
    }
  `,
})
export default class DocPage {
  readonly doc$ = injectContent<DocAttributes>('slug');
}
