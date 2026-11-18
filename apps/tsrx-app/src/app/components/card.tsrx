import { Component, contentChild, ElementRef } from '@angular/core';

// Projects its children with Angular's <ng-content>: a named `[card-title]`
// slot, the default slot, and a footer slot with fallback content.
export const CardMeta = { selector: 'demo-card' } satisfies Component;

export function Card() @{
  // A template ref on projected content, declared in the parent's markup.
  const title = contentChild<ElementRef<HTMLElement>>('title');

  <article class="card">
    <header><ng-content select="[card-title]" /></header>
    <ng-content />
    <footer>
      <ng-content select="[card-footer]">{'No footer given.'}</ng-content>
    </footer>
    <p class="query">{'contentChild: '}{title()?.nativeElement.textContent ?? 'none'}</p>
    <style>
      .card { border: 1px solid #ccc; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; max-width: 24rem; }
      .query { color: #666; font-size: 0.875rem; }
    </style>
  </article>
}
