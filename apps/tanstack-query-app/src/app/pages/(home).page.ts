import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLinkWithHref } from '@angular/router';

@Component({
  selector: 'tq-home-page',
  standalone: true,
  imports: [RouterLinkWithHref],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-8">
      <div class="text-center space-y-4">
        <h1 class="text-4xl font-black">TanStack Query + Analog</h1>
        <p class="text-lg text-base-content/70 max-w-2xl mx-auto">
          End-to-end type-safe server routes with TanStack Query integration,
          SSR hydration, and zero manual type duplication.
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <a
          routerLink="/tanstack-query"
          class="card card-border bg-base-100 shadow hover:shadow-lg transition-shadow"
        >
          <div class="card-body">
            <h2 class="card-title">Basic Query &amp; Mutation</h2>
            <p class="text-base-content/70">
              Fetch todos with SSR hydration, create new items with validated
              mutations, and see automatic cache invalidation.
            </p>
          </div>
        </a>

        <a
          routerLink="/tanstack-query-multi"
          class="card card-border bg-base-100 shadow hover:shadow-lg transition-shadow"
        >
          <div class="card-body">
            <h2 class="card-title">Multi &amp; Dependent Queries</h2>
            <p class="text-base-content/70">
              Run independent queries in parallel and chain dependent queries
              that only fire when parent data is available.
            </p>
          </div>
        </a>

        <a
          routerLink="/tanstack-query-infinite"
          class="card card-border bg-base-100 shadow hover:shadow-lg transition-shadow"
        >
          <div class="card-body">
            <h2 class="card-title">Infinite Query</h2>
            <p class="text-base-content/70">
              Cursor-based pagination with load-more, automatic page
              accumulation, and type-safe page params.
            </p>
          </div>
        </a>

        <a
          routerLink="/tanstack-query-optimistic"
          class="card card-border bg-base-100 shadow hover:shadow-lg transition-shadow"
        >
          <div class="card-body">
            <h2 class="card-title">Optimistic Updates</h2>
            <p class="text-base-content/70">
              Instant UI feedback with automatic rollback on server failure and
              cache reconciliation on success.
            </p>
          </div>
        </a>
      </div>
    </div>
  `,
})
export default class HomePageComponent {}
