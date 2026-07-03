import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { filter, map, startWith, tap } from 'rxjs/operators';
import { injectDocsConfig } from '../config';
import { useLocaleSignal } from '../locale';
import type { SidebarCategory, SidebarNode } from '../sidebar';

@Component({
  selector: 'docs-sidebar',
  imports: [RouterLink, RouterLinkActive, Sidebar],
  template: `
    <nav [class]="depth() === 0 ? 'text-[15px]' : 'text-[14px]'">
      <ul
        [class]="
          depth() === 0
            ? 'space-y-0.5'
            : 'mt-1 space-y-0.5 border-l ml-2 pl-3 ' +
              (activeTrail()
                ? 'border-[var(--brand)]'
                : 'border-[var(--border)]')
        "
      >
        @for (node of effectiveNodes(); track nodeKey(node, $index)) {
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
          } @else if (node.kind === 'category') {
            <li [class]="depth() === 0 ? 'mt-6' : 'mt-3'">
              <button
                type="button"
                (click)="toggle(node)"
                [class]="
                  depth() === 0
                    ? 'flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--fg-muted)] hover:text-[var(--fg)]'
                    : 'flex w-full items-center justify-between rounded px-2 py-1 text-left text-[13px] font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]'
                "
                [style.color]="isActiveTrail(node) ? 'var(--brand)' : null"
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
                <docs-sidebar
                  [nodes]="node.items"
                  [depth]="depth() + 1"
                  [activeTrail]="isActiveTrail(node)"
                />
              }
            </li>
          } @else {
            <li aria-hidden="true">
              <hr class="my-3 border-[var(--border)]" />
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
  /** Set by the parent level when this subtree contains the active doc. */
  readonly activeTrail = input(false);

  private readonly config = injectDocsConfig();
  private readonly locale = useLocaleSignal();
  private readonly router = inject(Router);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      // Navigating collapses any manually toggled categories, so the tree
      // reflects only the new route's active trail.
      tap(() => this.overrides.set(new Map())),
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

  protected nodeKey(node: SidebarNode, index: number): string {
    if (node.kind === 'doc') return `doc:${node.id}`;
    if (node.kind === 'category') return `cat:${node.label}`;
    return `break:${index}`;
  }

  protected isOpen(node: SidebarCategory): boolean {
    const override = this.overrides().get(node.label);
    if (override !== undefined) return override;
    return this.isActiveTrail(node);
  }

  protected isActiveTrail(node: SidebarCategory): boolean {
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
      } else if (child.kind === 'category' && this.containsActive(child, url)) {
        return true;
      }
    }
    return false;
  }
}
