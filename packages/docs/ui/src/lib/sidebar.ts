import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import {
  injectDocsConfig,
  useLocaleSignal,
  type SidebarCategory,
  type SidebarNode,
} from '@analogjs/docs';

@Component({
  selector: 'docs-sidebar',
  imports: [RouterLink, RouterLinkActive, Sidebar],
  template: `
    <nav [class]="depth() === 0 ? 'text-[15px]' : 'text-[14px]'">
      <ul
        [class]="
          depth() === 0
            ? 'space-y-0.5'
            : 'mt-1 space-y-0.5 border-l ml-2 pl-3 border-[var(--border)]'
        "
      >
        @for (node of effectiveNodes(); track nodeKey(node)) {
          @if (node.kind === 'doc') {
            <li>
              <a
                [routerLink]="hrefFor(node.id)"
                routerLinkActive="font-medium !text-[var(--brand)]"
                [routerLinkActiveOptions]="{ exact: true }"
                class="block rounded px-2 py-1 text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
                >{{ node.label }}</a
              >
            </li>
          } @else {
            <li [class]="depth() === 0 ? 'mt-6' : 'mt-3'">
              <button
                type="button"
                (click)="toggle(node)"
                [class]="
                  depth() === 0
                    ? 'flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--fg-muted)] hover:text-[var(--fg)]'
                    : 'flex w-full items-center justify-between rounded px-2 py-1 text-left text-[13px] font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]'
                "
                [attr.aria-expanded]="isOpen(node)"
              >
                <span>{{ node.label }}</span>
                <span
                  class="text-[var(--fg-subtle)] transition-transform"
                  [style.transform]="
                    isOpen(node) ? 'rotate(90deg)' : 'rotate(0)'
                  "
                  aria-hidden="true"
                  >▸</span
                >
              </button>
              @if (isOpen(node)) {
                <docs-sidebar [nodes]="node.items" [depth]="depth() + 1" />
              }
            </li>
          }
        }
      </ul>
    </nav>
  `,
})
export class Sidebar {
  readonly nodes = input<readonly SidebarNode[] | null>(null);
  readonly depth = input<number>(0);

  private readonly config = injectDocsConfig();
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

  protected readonly effectiveNodes = computed<readonly SidebarNode[]>(
    () => this.nodes() ?? this.config.sidebar ?? [],
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
