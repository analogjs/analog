import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, inject, PLATFORM_ID } from '@angular/core';

const STORAGE_KEY = 'docs-theme';

type Theme = 'light' | 'dark';

/**
 * Theme behavior:
 *   - No saved override → follow `prefers-color-scheme` live (re-applies
 *     when the OS toggles between light and dark while the page is open).
 *   - User clicks the toggle → flips the theme and writes the chosen
 *     value to localStorage, sticking until cleared.
 *
 * The .dark class on <html> is what every style hangs off of; consumers
 * should set it pre-bootstrap (e.g. via an inline script in index.html)
 * to avoid a flash.
 */
@Component({
  selector: 'docs-theme-toggle',
  template: `
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-full text-[var(--fg)] hover:bg-[var(--bg-subtle)]"
      aria-label="Toggle theme"
      (click)="toggle()"
    >
      <!-- Moon (light mode → click to switch to dark) -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-5 w-5 dark:!hidden"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
      <!-- Sun (dark mode → click to switch to light) -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="hidden h-5 w-5 dark:!block"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    </button>
  `,
})
export class ThemeToggle {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        this.applyTheme(e.matches ? 'dark' : 'light');
      }
    };
    mql.addEventListener('change', onSystemChange);
    this.destroyRef.onDestroy(() =>
      mql.removeEventListener('change', onSystemChange),
    );
  }

  protected toggle(): void {
    const next: Theme = this.currentTheme() === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  private currentTheme(): Theme {
    return document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light';
  }

  private applyTheme(t: Theme): void {
    document.documentElement.classList.toggle('dark', t === 'dark');
  }
}
