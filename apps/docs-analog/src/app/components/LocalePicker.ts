import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CONTENT_LOCALE } from '@analogjs/content';
import { injectSwitchLocale } from '@analogjs/router/i18n';

const LOCALES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt-br', label: 'Português (Brasil)' },
  { code: 'zh-hans', label: '简体中文' },
];

@Component({
  selector: 'docs-locale-picker',
  template: `
    <div class="relative">
      <button
        type="button"
        class="flex items-center gap-1 rounded p-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-900"
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
          class="absolute right-0 z-10 mt-1 min-w-[10rem] rounded border bg-white py-1 text-sm shadow-lg dark:bg-gray-900"
          style="border-color: var(--border)"
        >
          @for (loc of locales; track loc.code) {
            <li>
              <button
                type="button"
                role="menuitem"
                class="block w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
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
  `,
})
export class LocalePicker {
  private readonly router = inject(Router);
  private readonly currentLocale = inject(CONTENT_LOCALE, { optional: true });
  // Hard-reloads so $localize-resolved templates and CONTENT_LOCALE
  // (provided once via useFactory at bootstrap) pick up the new locale.
  private readonly switchLocale = injectSwitchLocale();

  protected readonly locales = LOCALES;
  protected readonly open = signal(false);

  protected readonly active = computed(() => this.currentLocale ?? 'en');
  protected readonly activeLabel = computed(() => {
    const code = this.active();
    return LOCALES.find((l) => l.code === code)?.label ?? code;
  });

  protected pick(code: string): void {
    this.open.set(false);
    this.switchLocale(code);
  }
}
