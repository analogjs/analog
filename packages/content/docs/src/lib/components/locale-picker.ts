import { Component, computed, inject, signal } from '@angular/core';
import { CONTENT_LOCALE } from '@analogjs/content';
import { injectDocsConfig } from '../config';

@Component({
  selector: 'docs-locale-picker',
  template: `
    @if (locales().length > 0) {
      <div class="relative">
        <button
          type="button"
          class="flex items-center gap-1 rounded p-1.5 text-sm hover:bg-[var(--bg-subtle)]"
          aria-haspopup="menu"
          [attr.aria-expanded]="open()"
          (click)="open.set(!open())"
        >
          🌐 {{ activeLabel() }}
          <span class="text-xs">▾</span>
        </button>
        @if (open()) {
          <ul
            role="menu"
            class="absolute right-0 z-10 mt-1 min-w-[10rem] rounded border py-1 text-sm shadow-lg"
            style="border-color: var(--border); background: var(--bg-elevated)"
          >
            @for (loc of locales(); track loc.code) {
              <li>
                <button
                  type="button"
                  role="menuitem"
                  class="block w-full px-3 py-1.5 text-left hover:bg-[var(--bg-subtle)]"
                  [class.font-semibold]="loc.code === active()"
                  (click)="pick(loc.code)"
                >
                  {{ loc.label }}
                </button>
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class LocalePicker {
  private readonly config = injectDocsConfig();
  private readonly currentLocale = inject(CONTENT_LOCALE, { optional: true });
  private readonly switchLocale = this.config.switchLocaleFactory?.();

  protected readonly locales = computed(() => this.config.locales?.list ?? []);
  protected readonly open = signal(false);

  protected readonly active = computed(
    () => this.currentLocale ?? this.config.locales?.default ?? '',
  );
  protected readonly activeLabel = computed(() => {
    const code = this.active();
    return this.locales().find((l) => l.code === code)?.label ?? code;
  });

  protected pick(code: string): void {
    this.open.set(false);
    this.switchLocale?.(code);
  }
}
