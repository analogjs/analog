import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SidebarDrawer } from '../components/SidebarDrawer';

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
export default class DocsLayoutPage {
  // /docs (with no slug) is the docs root — redirect to introduction so
  // the URL contract matches the Docusaurus default and inbound links
  // to /docs/ don't render an empty article.
  constructor() {
    const router = inject(Router);
    const url = router.url.split('?')[0].replace(/\/$/, '');
    if (url === '/docs') {
      router.navigate(['/docs/introduction'], { replaceUrl: true });
    }
  }
}
