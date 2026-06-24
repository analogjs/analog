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
      class="rounded p-1.5 text-sm hover:bg-[var(--bg-subtle)]"
      aria-label="Toggle theme"
      (click)="toggle()"
    >
      <span class="dark:hidden">🌙</span>
      <span class="hidden dark:inline">☀️</span>
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
