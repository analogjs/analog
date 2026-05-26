import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from '../../components/Sidebar';

@Component({
  imports: [RouterOutlet, Sidebar],
  template: `
    <div class="mx-auto flex max-w-7xl gap-8 px-6 py-8">
      <aside class="w-56 shrink-0 sticky top-8 self-start">
        <docs-sidebar />
      </aside>
      <article class="flex-1 min-w-0">
        <router-outlet />
      </article>
    </div>
  `,
})
export default class LocaleDocsLayoutPage {}
