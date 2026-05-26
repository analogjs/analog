import { isPlatformBrowser } from '@angular/common';
import { Component, effect, inject, PLATFORM_ID, signal } from '@angular/core';

const STORAGE_KEY = 'docs-theme';

type Theme = 'light' | 'dark';

@Component({
  selector: 'docs-theme-toggle',
  template: `
    <button
      type="button"
      class="rounded p-1.5 text-sm hover:bg-gray-100"
      [attr.aria-label]="
        theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      "
      (click)="toggle()"
    >
      @if (theme() === 'dark') {
        ☀️
      } @else {
        🌙
      }
    </button>
  `,
})
export class ThemeToggle {
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly theme = signal<Theme>('light');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const stored =
        (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? null;
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      this.theme.set(stored ?? (prefersDark ? 'dark' : 'light'));
    }
    effect(() => {
      const t = this.theme();
      if (isPlatformBrowser(this.platformId)) {
        document.documentElement.classList.toggle('dark', t === 'dark');
        localStorage.setItem(STORAGE_KEY, t);
      }
    });
  }

  protected toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }
}
