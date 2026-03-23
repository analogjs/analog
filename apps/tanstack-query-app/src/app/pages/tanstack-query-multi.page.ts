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
    <h3>Multi-Query Demo</h3>

    <section>
      @if (postsQuery.isPending()) {
        <p id="posts-loading">Loading posts...</p>
      } @else if (postsQuery.isSuccess()) {
        <p id="posts-fetch-count">{{ postsFetchCount() }}</p>
        <ul id="posts-list">
          @for (post of posts(); track post.id) {
            <li>{{ post.title }} by {{ post.author }}</li>
          }
        </ul>
      }
    </section>

    <section>
      @if (featuredPostQuery.isPending()) {
        <p id="featured-loading">Loading featured post...</p>
      } @else if (featuredPostQuery.isSuccess()) {
        <p id="featured-fetch-count">{{ featuredFetchCount() }}</p>
        <p id="featured-title">{{ featuredPost()?.title }}</p>
        <p id="featured-author">{{ featuredPost()?.author }}</p>
      }
    </section>

    <section>
      @if (authorPostsQuery.isPending()) {
        <p id="author-posts-loading">Loading author posts...</p>
      } @else if (authorPostsQuery.isSuccess()) {
        <p id="author-posts-fetch-count">{{ authorPostsFetchCount() }}</p>
        <ul id="author-posts-list">
          @for (post of authorPosts(); track post.id) {
            <li>{{ post.title }}</li>
          }
        </ul>
      }
    </section>
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
