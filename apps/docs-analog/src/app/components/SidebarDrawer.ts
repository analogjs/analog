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

    @if (open()) {
      <div
        class="fixed inset-0 z-40 bg-black/40 lg:hidden"
        (click)="open.set(false)"
        aria-hidden="true"
      ></div>
    }

    <aside
      id="docs-sidebar-drawer"
      class="docs-sticky-rail lg:sticky lg:top-8 lg:self-start lg:block lg:w-56 lg:shrink-0"
      [class.fixed]="open()"
      [class.inset-y-0]="open()"
      [class.left-0]="open()"
      [class.z-50]="open()"
      [class.w-72]="open()"
      [class.overflow-y-auto]="open()"
      [class.p-6]="open()"
      [class.shadow-xl]="open()"
      [class.hidden]="!open()"
      [style.background]="open() ? 'var(--bg)' : ''"
    >
      @if (open()) {
        <button
          type="button"
          class="mb-4 ml-auto flex h-8 w-8 items-center justify-center rounded border lg:hidden"
          style="border-color: var(--border)"
          aria-label="Close documentation menu"
          (click)="open.set(false)"
        >
          ✕
        </button>
      }
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
