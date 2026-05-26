import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from '../../components/Sidebar';

@Component({
  imports: [RouterOutlet, Sidebar],
  template: `
    <div class="mx-auto flex max-w-7xl gap-8 px-6 py-8">
      <docs-sidebar class="w-64 shrink-0" />
      <article class="flex-1 min-w-0">
        <router-outlet />
      </article>
    </div>
  `,
})
export default class LocaleDocsLayoutPage {}
