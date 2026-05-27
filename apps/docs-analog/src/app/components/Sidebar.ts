import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { useLocaleSignal } from '../locale';
import { sidebar, type SidebarCategory, type SidebarNode } from '../sidebar';

@Component({
  selector: 'docs-sidebar',
  imports: [RouterLink, RouterLinkActive, Sidebar],
  template: `
    <nav class="text-base">
      <ul class="space-y-1">
        @for (node of nodes(); track nodeKey(node)) {
          @if (node.kind === 'doc') {
            <li>
              <a
                [routerLink]="hrefFor(node.id)"
                routerLinkActive="font-semibold text-rose-600"
                [routerLinkActiveOptions]="{ exact: true }"
                class="block rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-900"
                >{{ node.label }}</a
              >
            </li>
          } @else {
            <li class="mt-4">
              <button
                type="button"
                (click)="toggle(node)"
                class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-base font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                [attr.aria-expanded]="isOpen(node)"
              >
                <span>{{ node.label }}</span>
                <span
                  class="text-gray-400 transition-transform"
                  [style.transform]="
                    isOpen(node) ? 'rotate(90deg)' : 'rotate(0)'
                  "
                  aria-hidden="true"
                  >▸</span
                >
              </button>
              @if (isOpen(node)) {
                <docs-sidebar [nodes]="node.items" />
              }
            </li>
          }
        }
      </ul>
    </nav>
  `,
})
export class Sidebar {
  readonly nodes = input<readonly SidebarNode[]>(sidebar);

  private readonly locale = useLocaleSignal();
  private readonly router = inject(Router);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Category labels the user has explicitly clicked.
   * Value = the open state they want for that category, overriding
   * the route-based auto-open behavior.
   */
  private readonly overrides = signal(new Map<string, boolean>());

  protected hrefFor(id: string): string {
    const loc = this.locale();
    return loc ? `/${loc}/docs/${id}` : `/docs/${id}`;
  }

  protected nodeKey(node: SidebarNode): string {
    return node.kind === 'doc' ? `doc:${node.id}` : `cat:${node.label}`;
  }

  protected isOpen(node: SidebarCategory): boolean {
    const override = this.overrides().get(node.label);
    if (override !== undefined) return override;
    return this.containsActive(node, this.currentUrl());
  }

  protected toggle(node: SidebarCategory): void {
    const next = new Map(this.overrides());
    next.set(node.label, !this.isOpen(node));
    this.overrides.set(next);
  }

  private containsActive(node: SidebarCategory, url: string): boolean {
    const path = url.split('?')[0].split('#')[0];
    for (const child of node.items) {
      if (child.kind === 'doc') {
        if (path === this.hrefFor(child.id)) return true;
      } else if (this.containsActive(child, url)) {
        return true;
      }
    }
    return false;
  }
}
