import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { SidebarDrawer } from '../../components/SidebarDrawer';

@Component({
  imports: [RouterOutlet, SidebarDrawer],
  template: `
    <div class="mx-auto flex max-w-7xl gap-8 px-6 py-8 lg:flex-row flex-col">
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
    const locale = route.snapshot.paramMap.get('locale');
    const url = router.url.split('?')[0].replace(/\/$/, '');
    if (locale && url === `/${locale}/docs`) {
      router.navigate([`/${locale}/docs/introduction`], { replaceUrl: true });
    }
  }
}
