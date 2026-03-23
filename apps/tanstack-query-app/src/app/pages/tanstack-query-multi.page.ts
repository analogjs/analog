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

import type { route } from '../../server/routes/api/v1/query-posts';

@Component({
  selector: 'analogjs-tanstack-query-multi-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <section
        class="rounded-box border border-base-300 bg-base-100 p-6 shadow-lg"
      >
        <div
          class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
        >
          <div class="space-y-3">
            <div class="badge badge-secondary badge-outline">
              Multi-query demo
            </div>
            <div class="space-y-2">
              <h1 class="text-3xl font-black tracking-tight">
                Parallel and dependent queries in one route
              </h1>
              <p class="max-w-2xl text-base-content/70">
                Posts and featured-post requests can run immediately, while the
                author feed waits until the featured post resolves.
              </p>
            </div>
          </div>

          <div class="badge badge-neutral badge-lg badge-outline">
            scope: {{ scope() }}
          </div>
        </div>
      </section>

      <div class="grid gap-6 xl:grid-cols-3">
        <section
          class="rounded-box border border-base-300 bg-base-100 p-6 shadow-sm"
        >
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 class="text-xl font-semibold">Posts list</h2>
              <p class="text-sm text-base-content/70">
                Independent query for the full list.
              </p>
            </div>
            <div id="posts-fetch-count" class="badge badge-primary badge-lg">
              {{ postsFetchCount() }}
            </div>
          </div>

          @if (postsQuery.isPending()) {
            <div id="posts-loading" class="alert alert-info">
              <span>Loading posts...</span>
            </div>
          } @else if (postsQuery.isSuccess()) {
            <ul id="posts-list" class="menu gap-2 rounded-box bg-base-200 p-3">
              @for (post of posts(); track post.id) {
                <li>
                  <div
                    class="flex flex-col gap-1 rounded-lg bg-base-100 px-4 py-3 shadow-sm"
                  >
                    <span class="font-medium">{{ post.title }}</span>
                    <span class="text-sm text-base-content/60">
                      by {{ post.author }}
                    </span>
                  </div>
                </li>
              }
            </ul>
          }
        </section>

        <section
          class="rounded-box border border-base-300 bg-base-100 p-6 shadow-sm"
        >
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 class="text-xl font-semibold">Featured post</h2>
              <p class="text-sm text-base-content/70">
                Detail query keyed separately from the list.
              </p>
            </div>
            <div
              id="featured-fetch-count"
              class="badge badge-secondary badge-lg"
            >
              {{ featuredFetchCount() }}
            </div>
          </div>

          @if (featuredPostQuery.isPending()) {
            <div id="featured-loading" class="alert alert-info">
              <span>Loading featured post...</span>
            </div>
          } @else if (featuredPostQuery.isSuccess()) {
            <div class="space-y-4 rounded-box bg-base-200 p-4">
              <div class="badge badge-outline">postId = 1</div>
              <div
                id="featured-title"
                class="text-xl font-semibold leading-tight"
              >
                {{ featuredPost()?.title }}
              </div>
              <p id="featured-author" class="text-sm text-base-content/70">
                {{ featuredPost()?.author }}
              </p>
            </div>
          }
        </section>

        <section
          class="rounded-box border border-base-300 bg-base-100 p-6 shadow-sm"
        >
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 class="text-xl font-semibold">Author feed</h2>
              <p class="text-sm text-base-content/70">
                Enabled only after the featured author is known.
              </p>
            </div>
            <div
              id="author-posts-fetch-count"
              class="badge badge-accent badge-lg"
            >
              {{ authorPostsFetchCount() }}
            </div>
          </div>

          @if (authorPostsQuery.isPending()) {
            <div id="author-posts-loading" class="alert alert-info">
              <span>Loading author posts...</span>
            </div>
          } @else if (authorPostsQuery.isSuccess()) {
            <ul
              id="author-posts-list"
              class="menu gap-2 rounded-box bg-base-200 p-3"
            >
              @for (post of authorPosts(); track post.id) {
                <li>
                  <div class="rounded-lg bg-base-100 px-4 py-3 shadow-sm">
                    {{ post.title }}
                  </div>
                </li>
              }
            </ul>
          } @else {
            <div class="alert">
              <span
                >Waiting for the featured author before fetching more
                posts.</span
              >
            </div>
          }
        </section>
      </div>
    </div>
  `,
})
export default class TanStackQueryMultiPageComponent {
  private readonly http = inject(HttpClient);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly queryParamMap = toSignal(this.activatedRoute.queryParamMap, {
    initialValue: this.activatedRoute.snapshot.queryParamMap,
  });

  readonly scope = computed(
    () => this.queryParamMap().get('scope') ?? 'default',
  );

  readonly postsQuery = injectQuery(() =>
    serverQueryOptions<typeof route>(this.http, '/api/v1/query-posts', {
      queryKey: ['posts-list', this.scope()] as const,
      query: { scope: this.scope(), postId: '', author: '' },
      staleTime: 60_000,
    }),
  );

  readonly featuredPostQuery = injectQuery(() =>
    serverQueryOptions<typeof route>(this.http, '/api/v1/query-posts', {
      queryKey: ['post-detail', this.scope(), '1'] as const,
      query: { scope: this.scope(), postId: '1', author: '' },
      staleTime: 60_000,
    }),
  );

  readonly featuredAuthor = computed(
    () => this.featuredPostQuery.data()?.post?.author ?? '',
  );

  readonly authorPostsQuery = injectQuery(() => {
    const author = this.featuredAuthor();
    return {
      ...serverQueryOptions<typeof route>(this.http, '/api/v1/query-posts', {
        queryKey: ['author-posts', this.scope(), author] as const,
        query: { scope: this.scope(), postId: '', author },
        staleTime: 60_000,
      }),
      enabled: author.length > 0,
    };
  });

  readonly posts = computed(() => this.postsQuery.data()?.posts ?? []);
  readonly postsFetchCount = computed(
    () => this.postsQuery.data()?.listFetchCount ?? 0,
  );

  readonly featuredPost = computed(
    () => this.featuredPostQuery.data()?.post ?? null,
  );
  readonly featuredFetchCount = computed(
    () => this.featuredPostQuery.data()?.detailFetchCount ?? 0,
  );

  readonly authorPosts = computed(
    () => this.authorPostsQuery.data()?.authorPosts ?? [],
  );
  readonly authorPostsFetchCount = computed(
    () => this.authorPostsQuery.data()?.authorFetchCount ?? 0,
  );
}
