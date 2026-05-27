import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarDrawer } from '../../components/SidebarDrawer';

@Component({
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
export default class LocaleDocsLayoutPage {
  constructor() {
    const router = inject(Router);
    const route = inject(ActivatedRoute);
    const redirectIfRoot = () => {
      const locale = route.snapshot.paramMap.get('locale');
      const url = router.url.split('?')[0].replace(/\/$/, '');
      if (locale && url === `/${locale}/docs`) {
        router.navigate([`/${locale}/docs/introduction`], { replaceUrl: true });
      }
    };
    redirectIfRoot();
    router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => redirectIfRoot());
  }
}
