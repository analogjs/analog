import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  effect,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Sidebar } from './Sidebar';

/**
 * Wraps the navigation Sidebar with a responsive drawer:
 *   - lg and up: rendered inline as a sticky left rail (matches the
 *     desktop layout that existed before).
 *   - below lg: hidden by default; a hamburger button opens it as a
 *     slide-in overlay. Closes on route change, on backdrop click, or
 *     on Escape.
 */
@Component({
  selector: 'docs-sidebar-drawer',
  imports: [Sidebar],
  template: `
    <button
      type="button"
      class="mb-4 flex items-center gap-2 rounded border px-3 py-1.5 text-sm lg:hidden"
      style="border-color: var(--border)"
      [attr.aria-expanded]="open()"
      aria-controls="docs-sidebar-drawer"
      aria-label="Open documentation menu"
      (click)="open.set(true)"
    >
      ☰ Menu
    </button>

    <!-- Backdrop: always rendered, fades opacity for animation. -->
    <div
      class="pointer-events-none fixed inset-0 z-40 bg-black/40 opacity-0 transition-opacity duration-200 ease-out lg:hidden"
      [class.!pointer-events-auto]="open()"
      [class.!opacity-100]="open()"
      (click)="open.set(false)"
      aria-hidden="true"
    ></div>

    <!--
      Drawer:
        mobile: always positioned fixed; translates off-screen when closed
        so the open/close transition is smooth in both directions.
        lg+: reset to a sticky inline rail and clear the transform.
    -->
    <aside
      id="docs-sidebar-drawer"
      class="docs-sticky-rail fixed inset-y-0 left-0 z-50 w-72 -translate-x-full overflow-y-auto p-6 shadow-xl transition-transform duration-200 ease-out lg:sticky lg:inset-auto lg:left-auto lg:top-8 lg:z-auto lg:block lg:w-56 lg:translate-x-0 lg:self-start lg:overflow-visible lg:p-0 lg:shadow-none lg:transition-none"
      [class.translate-x-0]="open()"
      [style.background]="'var(--bg)'"
    >
      <button
        type="button"
        class="mb-4 ml-auto flex h-8 w-8 items-center justify-center rounded border lg:hidden"
        style="border-color: var(--border)"
        aria-label="Close documentation menu"
        (click)="open.set(false)"
      >
        ✕
      </button>
      <docs-sidebar />
    </aside>
  `,
})
export class SidebarDrawer {
  readonly externalOpen = input(false);

  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly open = signal(false);

  constructor() {
    // Close drawer on navigation (so picking a sidebar link returns to
    // the article on mobile).
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.open.set(false));

    if (isPlatformBrowser(this.platformId)) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') this.open.set(false);
      };
      document.addEventListener('keydown', onKey);
    }

    effect(() => {
      // Body scroll lock while drawer is open on small screens.
      if (!isPlatformBrowser(this.platformId)) return;
      document.body.style.overflow = this.open() ? 'hidden' : '';
    });
  }
}
