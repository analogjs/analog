import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface LinkColumn {
  title: string;
  items: { label: string; href?: string; routerLink?: string }[];
}

const COLUMNS: LinkColumn[] = [
  {
    title: 'Documentation',
    items: [
      { label: 'Introduction', routerLink: '/docs/introduction' },
      { label: 'Getting Started', routerLink: '/docs/getting-started' },
      { label: 'llms.txt', href: 'https://analogjs.org/llms.txt' },
      { label: 'llms-full.txt', href: 'https://analogjs.org/llms-full.txt' },
    ],
  },
  {
    title: 'Open source',
    items: [
      { label: 'Contributors', routerLink: '/docs/contributors' },
      { label: 'Contributing', routerLink: '/docs/contributing' },
      { label: 'Sponsoring', routerLink: '/docs/sponsoring' },
    ],
  },
  {
    title: 'More',
    items: [
      { label: 'GitHub', href: 'https://github.com/analogjs/analog' },
      { label: 'Discord', href: 'https://chat.analogjs.org' },
      {
        label: 'Stack Overflow',
        href: 'https://stackoverflow.com/questions/tagged/analogjs',
      },
    ],
  },
];

@Component({
  selector: 'docs-footer',
  imports: [RouterLink],
  template: `
    <footer
      class="border-t px-6 py-10"
      style="border-color: var(--border); color: var(--fg-muted)"
    >
      <div class="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
        @for (col of columns; track col.title) {
          <div>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide">
              {{ col.title }}
            </h3>
            <ul class="space-y-2 text-sm">
              @for (item of col.items; track item.label) {
                <li>
                  @if (item.routerLink) {
                    <a [routerLink]="item.routerLink" class="hover:underline">{{
                      item.label
                    }}</a>
                  } @else {
                    <a
                      [href]="item.href"
                      target="_blank"
                      rel="noopener"
                      class="hover:underline"
                      >{{ item.label }}</a
                    >
                  }
                </li>
              }
            </ul>
          </div>
        }
      </div>
      <p
        class="mx-auto mt-10 max-w-6xl text-center text-xs"
        style="color: var(--fg-muted)"
      >
        © 2022–{{ year }} Analog. Licensed under MIT.
      </p>
    </footer>
  `,
})
export class Footer {
  protected readonly columns = COLUMNS;
  protected readonly year = new Date().getFullYear();
}
