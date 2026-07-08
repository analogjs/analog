import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectDocsConfig } from '../config';
import { LocalePicker } from './locale-picker';
import { Search } from './search';
import { ThemeToggle } from './theme-toggle';

@Component({
  selector: 'docs-header',
  imports: [LocalePicker, RouterLink, Search, ThemeToggle],
  template: `
    <header
      class="flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-6"
      style="border-color: var(--border)"
    >
      <a
        [routerLink]="brand().homeLink ?? '/'"
        class="flex shrink-0 items-center gap-2 text-lg font-semibold"
      >
        <img
          [src]="brand().logoSrc"
          [alt]="brand().logoAlt ?? ''"
          width="32"
          height="32"
          class="inline-block"
        />
        {{ brand().name }}
      </a>
      <div class="flex min-w-0 items-center gap-2 text-sm sm:gap-4">
        <docs-search />
        @if (headerNav().length > 0) {
          <nav class="hidden gap-4 sm:flex">
            @for (link of headerNav(); track link.label) {
              @if (link.routerLink) {
                <a [routerLink]="link.routerLink">{{ link.label }}</a>
              } @else if (link.href) {
                <a [href]="link.href" target="_blank" rel="noopener">{{
                  link.label
                }}</a>
              }
            }
          </nav>
        }
        <div class="flex items-center gap-1">
          <docs-locale-picker />
          <docs-theme-toggle />
        </div>
      </div>
    </header>
  `,
})
export class Header {
  private readonly config = injectDocsConfig();
  protected readonly brand = computed(() => this.config.brand);
  protected readonly headerNav = computed(() => this.config.headerNav ?? []);
}
