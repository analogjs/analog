import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectDocsConfig } from '../config';

@Component({
  selector: 'docs-footer',
  imports: [RouterLink],
  template: `
    <footer
      class="border-t px-6 py-10"
      style="border-color: var(--border); color: var(--fg-muted)"
    >
      @if (brand() || columns().length > 0) {
        <div
          class="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2"
          [class.lg:grid-cols-3]="!brand()"
          [class.lg:grid-cols-4]="brand()"
        >
          @if (brand(); as b) {
            <div class="flex flex-col gap-3 text-sm">
              @if (b.logoSrc) {
                <img
                  [src]="b.logoSrc"
                  [alt]="b.logoAlt ?? ''"
                  class="h-10 w-auto self-start"
                />
              }
              @if (b.copyright) {
                <span>{{ b.copyright }}</span>
              }
              @if (b.tagline) {
                <span>{{ b.tagline }}</span>
              }
            </div>
          }
          @for (col of columns(); track col.title) {
            <div>
              <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide">
                {{ col.title }}
              </h3>
              <ul class="space-y-2 text-sm">
                @for (item of col.items; track item.label) {
                  <li>
                    @if (item.routerLink) {
                      <a
                        [routerLink]="item.routerLink"
                        class="hover:underline"
                        >{{ item.label }}</a
                      >
                    } @else if (item.href) {
                      <a
                        [href]="item.href"
                        target="_blank"
                        rel="noopener"
                        class="hover:underline"
                        >{{ item.label }}</a
                      >
                    }
                  </li>
                }
              </ul>
            </div>
          }
        </div>
      }
      @if (legalLine()) {
        <p
          class="mx-auto mt-10 max-w-6xl text-center text-xs"
          style="color: var(--fg-muted)"
        >
          {{ legalLine() }}
        </p>
      }
    </footer>
  `,
})
export class Footer {
  private readonly config = injectDocsConfig();
  protected readonly brand = computed(() => this.config.footer?.brand);
  protected readonly columns = computed(
    () => this.config.footer?.columns ?? [],
  );
  protected readonly legalLine = computed(() => this.config.footer?.legalLine);
}
