import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { serverQueryOptions } from '@analogjs/router/tanstack-query';

import type { route as postsRoute } from '../../server/routes/api/v1/query-posts';

@Component({
  selector: 'analogjs-tanstack-query-load-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <section
        class="rounded-box border border-base-300 bg-base-100 p-6 shadow-lg"
      >
        <div
          class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
        >
          <div class="space-y-3">
            <div class="badge badge-info badge-outline">Load-time prefetch</div>
            <div class="space-y-2">
              <h1 class="text-3xl font-black tracking-tight">
                Prefetch in <code>.server.ts</code> with
                <code>definePageLoadQueries</code>
              </h1>
              <p class="max-w-2xl text-base-content/70">
                The posts list is fetched inside the Nitro page-load handler,
                the dehydrated cache rides along on the route data, and the
                Angular Router hydrator merges it into the active client on
                <code>ResolveEnd</code> — so this component renders against a
                warm cache without firing its own request.
              </p>
            </div>
          </div>

          <div
            class="stats stats-vertical border border-base-300 bg-base-200 shadow-sm sm:stats-horizontal"
          >
            <div class="stat">
              <div class="stat-title">Scope</div>
              <div id="load-scope" class="stat-value text-lg capitalize">
                {{ scope() }}
              </div>
              <div class="stat-desc">From ?scope= query param</div>
            </div>
            <div class="stat">
              <div class="stat-title">List fetch count</div>
              <div id="load-fetch-count" class="stat-value text-info">
                {{ listFetchCount() }}
              </div>
              <div class="stat-desc">
                Increments only on the server prefetch
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        class="rounded-box border border-base-300 bg-base-100 p-6 shadow-sm"
      >
        <div class="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold">Posts</h2>
            <p class="text-sm text-base-content/70">
              Cache key shared between
              <code>definePageLoadQueries</code> and <code>injectQuery</code>.
            </p>
          </div>
          <div class="badge badge-neutral badge-outline">SSR prefetch</div>
        </div>

        @if (postsQuery.isPending()) {
          <div id="load-loading" class="alert alert-info">
            <span>Loading posts...</span>
          </div>
        } @else if (postsQuery.error()) {
          <div id="load-query-error" class="alert alert-error">
            <span>Unable to load posts.</span>
          </div>
        } @else {
          <ul
            id="load-posts-list"
            class="menu gap-2 rounded-box bg-base-200 p-3"
          >
            @for (post of posts(); track post.id) {
              <li>
                <div
                  class="flex items-center justify-between rounded-lg bg-base-100 px-4 py-3 shadow-sm"
                >
                  <div class="flex flex-col">
                    <span class="font-medium">{{ post.title }}</span>
                    <span class="text-sm text-base-content/60">
                      by {{ post.author }}
                    </span>
                  </div>
                  <span class="badge badge-ghost">prefetched</span>
                </div>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
})
export default class TanStackQueryLoadPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly scope = computed(
    () => this.queryParamMap().get('scope') ?? 'default',
  );

  readonly postsQuery = injectQuery(() =>
    serverQueryOptions<typeof postsRoute>(this.http, '/api/v1/query-posts', {
      queryKey: ['analog-query-load-posts', this.scope()] as const,
      query: { scope: this.scope() },
      staleTime: 60_000,
    }),
  );

  readonly posts = computed(() => this.postsQuery.data()?.posts ?? []);
  readonly listFetchCount = computed(
    () => this.postsQuery.data()?.listFetchCount ?? 0,
  );
}
