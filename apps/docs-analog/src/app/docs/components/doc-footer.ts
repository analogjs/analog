import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectDocsConfig } from '../config';
import { useLocaleSignal } from '../locale';
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
            class="flex flex-col rounded border p-3 transition hover:bg-[var(--bg-subtle)]"
          >
            <span class="text-xs text-[var(--fg-muted)]">
              @for (parent of p.parents; track $index) {
                @if (!$first) {
                  <span aria-hidden="true">›</span>
                }
                {{ parent }}
              } @empty {
                Previous
              }
            </span>
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
            class="flex flex-col items-end rounded border p-3 text-right transition hover:bg-[var(--bg-subtle)]"
          >
            <span class="text-xs text-[var(--fg-muted)]">
              @for (parent of n.parents; track $index) {
                @if (!$first) {
                  <span aria-hidden="true">›</span>
                }
                {{ parent }}
              } @empty {
                Next
              }
            </span>
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

  private readonly config = injectDocsConfig();
  private readonly locale = useLocaleSignal();

  private readonly flat = computed(() =>
    flattenSidebar(this.config.sidebar, this.locale()),
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
