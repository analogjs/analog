import { Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CONTENT_LOCALE } from '@analogjs/content';
import { sidebar, type SidebarNode } from '../sidebar';

@Component({
  selector: 'docs-sidebar',
  imports: [RouterLink, RouterLinkActive, Sidebar],
  template: `
    <nav class="text-sm">
      <ul class="space-y-1">
        @for (
          node of nodes();
          track node.kind === 'doc' ? node.id : node.label
        ) {
          @if (node.kind === 'doc') {
            <li>
              <a
                [routerLink]="hrefFor(node.id)"
                routerLinkActive="font-semibold text-blue-600"
                [routerLinkActiveOptions]="{ exact: true }"
                class="block rounded px-2 py-1 hover:bg-gray-100"
                >{{ node.label }}</a
              >
            </li>
          } @else {
            <li class="mt-4">
              <p
                class="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                {{ node.label }}
              </p>
              <docs-sidebar [nodes]="node.items" />
            </li>
          }
        }
      </ul>
    </nav>
  `,
})
export class Sidebar {
  readonly nodes = input<readonly SidebarNode[]>(sidebar);

  private readonly locale = inject(CONTENT_LOCALE, { optional: true });

  protected hrefFor(id: string): string {
    return this.locale ? `/${this.locale}/docs/${id}` : `/docs/${id}`;
  }
}
