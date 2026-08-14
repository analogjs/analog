import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { injectInfiniteQuery } from '@tanstack/angular-query-experimental';
import { serverInfiniteQueryOptions } from '@analogjs/router/tanstack-query';

import type { route } from '../../server/routes/api/v1/query-comments.get';

@Component({
  selector: 'analogjs-tanstack-query-infinite-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <section
        class="rounded-box border border-base-300 bg-base-100 p-6 shadow-lg"
      >
        <div
          class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
        >
          <div class="space-y-3">
            <div class="badge badge-accent badge-outline">
              Infinite query demo
            </div>
            <div class="space-y-2">
              <h1 class="text-3xl font-black tracking-tight">
                Cursor-based pagination with visible page state
              </h1>
              <p class="max-w-2xl text-base-content/70">
                Load comments in chunks, preserve already fetched pages, and
                keep the active fetch state obvious while more items stream in.
              </p>
            </div>
          </div>

          <div class="stats border border-base-300 bg-base-200 shadow-sm">
            <div class="stat">
              <div class="stat-title">Fetch count</div>
              <div id="comments-fetch-count" class="stat-value text-primary">
                {{ fetchCount() }}
              </div>
            </div>
            <div class="stat">
              <div class="stat-title">Pages</div>
              <div id="page-count" class="stat-value text-secondary">
                {{ pageCount() }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        class="rounded-box border border-base-300 bg-base-100 p-6 shadow-sm"
      >
        @if (commentsQuery.isPending()) {
          <div id="comments-loading" class="alert alert-info">
            <span>Loading comments...</span>
          </div>
        } @else if (commentsQuery.error()) {
          <div id="comments-error" class="alert alert-error">
            <span>Unable to load comments.</span>
          </div>
        } @else {
          <ul id="comments-list" class="timeline timeline-vertical">
            @for (comment of allComments(); track comment.id) {
              <li>
                <div class="timeline-middle">
                  <div class="h-3 w-3 rounded-full bg-accent"></div>
                </div>
                <div class="timeline-end mb-6 w-full">
                  <div
                    class="rounded-box border border-base-300 bg-base-200 px-4 py-3 shadow-sm"
                  >
                    {{ comment.text }}
                  </div>
                </div>
                <hr />
              </li>
            }
          </ul>

          <div class="mt-6 flex flex-wrap items-center gap-3">
            @if (commentsQuery.hasNextPage()) {
              <button
                id="load-more"
                type="button"
                class="btn btn-primary"
                [disabled]="commentsQuery.isFetchingNextPage()"
                (click)="loadMore()"
              >
                @if (commentsQuery.isFetchingNextPage()) {
                  <span class="loading loading-spinner loading-sm"></span>
                  Loading more...
                } @else {
                  Load More
                }
              </button>
            } @else {
              <div class="badge badge-success badge-outline">
                End of feed reached
              </div>
            }

            <span class="text-sm text-base-content/70">
              Each request appends the next page without replacing existing
              comments.
            </span>
          </div>
        }
      </section>
    </div>
  `,
})
export default class TanStackQueryInfinitePageComponent {
  private readonly http = inject(HttpClient);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly queryParamMap = toSignal(this.activatedRoute.queryParamMap, {
    initialValue: this.activatedRoute.snapshot.queryParamMap,
  });

  readonly scope = computed(
    () => this.queryParamMap().get('scope') ?? 'default',
  );

  readonly commentsQuery = injectInfiniteQuery(() =>
    serverInfiniteQueryOptions<
      typeof route,
      Error,
      any,
      readonly string[],
      number
    >(this.http, '/api/v1/query-comments', {
      queryKey: ['comments', this.scope()] as const,
      query: ({ pageParam }) => ({
        scope: this.scope(),
        cursor: pageParam,
        limit: 3,
      }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 60_000,
    }),
  );

  readonly allComments = computed(
    () => this.commentsQuery.data()?.pages.flatMap((p: any) => p.items) ?? [],
  );

  readonly pageCount = computed(
    () => this.commentsQuery.data()?.pages.length ?? 0,
  );

  readonly fetchCount = computed(
    () => this.commentsQuery.data()?.pages[0]?.fetchCount ?? 0,
  );

  loadMore() {
    this.commentsQuery.fetchNextPage();
  }
}
