import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CONTENT_LOCALE } from '@analogjs/content';
import { findSidebarIndex, flattenSidebar } from '../sidebar';

@Component({
  selector: 'docs-doc-footer',
  imports: [RouterLink],
  template: `
    @if (prev() || next()) {
      <nav
        class="mt-12 flex items-center justify-between gap-4 border-t pt-6 text-sm"
      >
        @if (prev(); as p) {
          <a
            [routerLink]="p.href"
            class="flex flex-col rounded border p-3 transition hover:bg-gray-50"
          >
            <span class="text-xs text-gray-700 dark:text-white">Previous</span>
            <span class="font-medium" style="color: var(--brand)"
              >← {{ p.label }}</span
            >
          </a>
        } @else {
          <span></span>
        }
        @if (next(); as n) {
          <a
            [routerLink]="n.href"
            class="flex flex-col items-end rounded border p-3 text-right transition hover:bg-gray-50"
          >
            <span class="text-xs text-gray-700 dark:text-white">Next</span>
            <span class="font-medium" style="color: var(--brand)"
              >{{ n.label }} →</span
            >
          </a>
        } @else {
          <span></span>
        }
      </nav>
    }
  `,
})
export class DocFooter {
  readonly slug = input.required<string>();

  private readonly locale = inject(CONTENT_LOCALE, { optional: true });

  private readonly flat = computed(() =>
    flattenSidebar(undefined, this.locale),
  );
  private readonly index = computed(() =>
    findSidebarIndex(this.flat(), this.slug()),
  );

  protected readonly prev = computed(() => {
    const i = this.index();
    return i > 0 ? this.flat()[i - 1] : null;
  });
  protected readonly next = computed(() => {
    const i = this.index();
    return i >= 0 && i < this.flat().length - 1 ? this.flat()[i + 1] : null;
  });
}
