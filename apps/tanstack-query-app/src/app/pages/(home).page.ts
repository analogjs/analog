import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLinkWithHref } from '@angular/router';

@Component({
  selector: 'tq-home-page',
  standalone: true,
  imports: [RouterLinkWithHref],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-8 lg:space-y-10">
      <section
        class="hero overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-xl"
      >
        <div
          class="hero-content grid gap-8 px-6 py-10 lg:grid-cols-[1.3fr_0.7fr] lg:px-10"
        >
          <div class="space-y-5">
            <div class="badge badge-primary badge-outline badge-lg">
              SSR-ready query demos
            </div>
            <div class="space-y-4">
              <h1 class="text-4xl font-black tracking-tight sm:text-5xl">
                TanStack Query + Analog
              </h1>
              <p class="max-w-2xl text-lg text-base-content/70">
                End-to-end type-safe server routes with TanStack Query
                integration, SSR hydration, and zero manual type duplication.
              </p>
            </div>
            <div class="flex flex-wrap gap-3">
              <a routerLink="/tanstack-query" class="btn btn-primary">
                Open basic demo
              </a>
              <a
                routerLink="/tanstack-query-optimistic"
                class="btn btn-outline"
              >
                View optimistic updates
              </a>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div class="stat rounded-box border border-base-300 bg-base-200">
              <div class="stat-title">Server routes</div>
              <div class="stat-value text-primary">Typed</div>
              <div class="stat-desc">No duplicate client contracts</div>
            </div>
            <div class="stat rounded-box border border-base-300 bg-base-200">
              <div class="stat-title">Rendering</div>
              <div class="stat-value text-secondary">SSR</div>
              <div class="stat-desc">Hydrate with cached query data</div>
            </div>
            <div class="stat rounded-box border border-base-300 bg-base-200">
              <div class="stat-title">Examples</div>
              <div class="stat-value">4</div>
              <div class="stat-desc">Basic, multi, infinite, optimistic</div>
            </div>
          </div>
        </div>
      </section>

      <div class="space-y-3 text-center">
        <h2 class="text-2xl font-bold tracking-tight">
          Pick a data-flow pattern
        </h2>
        <p class="mx-auto max-w-2xl text-base-content/70">
          Each route focuses on one query pattern and keeps its network state
          visible so you can compare behavior quickly.
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <a
          routerLink="/tanstack-query"
          class="card card-border bg-base-100 shadow-md transition-all hover:-translate-y-1 hover:shadow-xl"
        >
          <div class="card-body">
            <div class="badge badge-primary badge-outline">Starter flow</div>
            <h2 class="card-title text-xl">Basic Query &amp; Mutation</h2>
            <p class="text-base-content/70">
              Fetch todos with SSR hydration, create new items with validated
              mutations, and see automatic cache invalidation.
            </p>
          </div>
        </a>

        <a
          routerLink="/tanstack-query-multi"
          class="card card-border bg-base-100 shadow-md transition-all hover:-translate-y-1 hover:shadow-xl"
        >
          <div class="card-body">
            <div class="badge badge-secondary badge-outline">
              Parallel + dependent
            </div>
            <h2 class="card-title text-xl">Multi &amp; Dependent Queries</h2>
            <p class="text-base-content/70">
              Run independent queries in parallel and chain dependent queries
              that only fire when parent data is available.
            </p>
          </div>
        </a>

        <a
          routerLink="/tanstack-query-infinite"
          class="card card-border bg-base-100 shadow-md transition-all hover:-translate-y-1 hover:shadow-xl"
        >
          <div class="card-body">
            <div class="badge badge-accent badge-outline">Pagination</div>
            <h2 class="card-title text-xl">Infinite Query</h2>
            <p class="text-base-content/70">
              Cursor-based pagination with load-more, automatic page
              accumulation, and type-safe page params.
            </p>
          </div>
        </a>

        <a
          routerLink="/tanstack-query-optimistic"
          class="card card-border bg-base-100 shadow-md transition-all hover:-translate-y-1 hover:shadow-xl"
        >
          <div class="card-body">
            <div class="badge badge-success badge-outline">
              Instant feedback
            </div>
            <h2 class="card-title text-xl">Optimistic Updates</h2>
            <p class="text-base-content/70">
              Instant UI feedback with automatic rollback on server failure and
              cache reconciliation on success.
            </p>
          </div>
        </a>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <div
          class="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm"
        >
          <h3 class="font-semibold">Hydration-aware</h3>
          <p class="mt-2 text-sm text-base-content/70">
            The demos surface fetch counts so it is obvious when SSR avoids a
            redundant client request.
          </p>
        </div>
        <div
          class="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm"
        >
          <h3 class="font-semibold">Mutation feedback</h3>
          <p class="mt-2 text-sm text-base-content/70">
            Error messages, invalidations, and optimistic states stay visible
            instead of being hidden behind devtools.
          </p>
        </div>
        <div
          class="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm"
        >
          <h3 class="font-semibold">Route-safe types</h3>
          <p class="mt-2 text-sm text-base-content/70">
            Server route definitions drive the client options so the examples
            stay compact without losing end-to-end type safety.
          </p>
        </div>
      </div>
    </div>
  `,
})
export default class HomePageComponent {}
