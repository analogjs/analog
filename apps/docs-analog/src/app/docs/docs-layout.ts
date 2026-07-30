import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarDrawer } from './components/sidebar-drawer';

/**
 * Shared shell for the localized and non-localized docs layout pages:
 * the responsive sidebar drawer next to the routed article outlet.
 */
@Component({
  selector: 'docs-layout-shell',
  imports: [RouterOutlet, SidebarDrawer],
  template: `
    <div
      class="mx-auto flex max-w-[96rem] gap-10 px-6 py-8 lg:flex-row flex-col"
    >
      <docs-sidebar-drawer />
      <article class="flex-1 min-w-0">
        <router-outlet />
      </article>
    </div>
  `,
})
export class DocsLayoutShell {}

/**
 * Redirects the docs root (e.g. `/docs` or `/<locale>/docs`) to its
 * introduction page so inbound links don't render an empty article.
 * `getBase` returns the current locale-aware base path (or null when it
 * shouldn't redirect). Runs on mount and every subsequent navigation.
 */
export function redirectDocsRoot(getBase: () => string | null): void {
  const router = inject(Router);
  const redirect = () => {
    const base = getBase();
    const url = router.url.split('?')[0].replace(/\/$/, '');
    if (base && url === base) {
      router.navigate([`${base}/introduction`], { replaceUrl: true });
    }
  };
  redirect();
  router.events
    .pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntilDestroyed(inject(DestroyRef)),
    )
    .subscribe(() => redirect());
}
