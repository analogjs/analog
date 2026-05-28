import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { CONTENT_LOCALE } from '@analogjs/content';

const LOCALES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
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
  private readonly platformId = inject(PLATFORM_ID);
  private readonly currentLocale = inject(CONTENT_LOCALE, { optional: true });

  protected readonly locales = LOCALES;
  protected readonly open = signal(false);

  protected readonly active = computed(() => this.currentLocale ?? 'en');
  protected readonly activeLabel = computed(() => {
    const code = this.active();
    return LOCALES.find((l) => l.code === code)?.label ?? code;
  });

  protected pick(code: string): void {
    this.open.set(false);
    if (!isPlatformBrowser(this.platformId)) return;
    // Hard reload: CONTENT_LOCALE is provided once at app bootstrap via
    // a useFactory and the cached value drives every content lookup, so
    // a SPA navigation keeps serving the previous locale's markdown.
    // Reloading rebuilds the injector with the new active locale.
    window.location.assign(computeLocaleTarget(code, window.location.pathname));
  }
}

/**
 * Map (locale code, current pathname) → the URL we should hard-reload to.
 * Strips any existing supported-locale prefix, then prepends the new one
 * (or nothing for the default English route).
 *
 * The only translated content lives under /docs, so picking a non-English
 * locale from a page that has no /docs equivalent (e.g. the marketing
 * home `/`) lands on /<locale>/docs/introduction instead of /<locale>/
 * (which has no route and renders blank).
 */
export function computeLocaleTarget(code: string, pathname: string): string {
  const stripped = pathname.replace(
    /^\/(de|es|fr|ko|pt-br|tr|zh-hans)(\/|$)/,
    '/',
  );
  if (code === 'en') return stripped;
  const hasDocs = stripped === '/docs' || stripped.startsWith('/docs/');
  return hasDocs ? `/${code}${stripped}` : `/${code}/docs/introduction`;
}
