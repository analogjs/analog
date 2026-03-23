import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { injectInfiniteQuery } from '@analogjs/router/query';

type Comment = {
  id: string;
  text: string;
};

type CommentsPageResponse = {
  fetchCount: number;
  items: Comment[];
  nextCursor: number | null;
};

@Component({
  selector: 'analogjs-tanstack-query-infinite-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Infinite Query Demo</h3>

    @if (commentsQuery.isPending()) {
      <p id="comments-loading">Loading comments...</p>
    } @else if (commentsQuery.error()) {
      <p id="comments-error">Unable to load comments.</p>
    } @else {
      <p id="comments-fetch-count">{{ fetchCount() }}</p>
      <p id="page-count">{{ pageCount() }}</p>

      <ul id="comments-list">
        @for (comment of allComments(); track comment.id) {
          <li>{{ comment.text }}</li>
        }
      </ul>

      @if (commentsQuery.hasNextPage()) {
        <button
          id="load-more"
          type="button"
          [disabled]="commentsQuery.isFetchingNextPage()"
          (click)="loadMore()"
        >
          @if (commentsQuery.isFetchingNextPage()) {
            Loading more...
          } @else {
            Load More
          }
        </button>
      }
    }
  `,
})
export default class TanStackQueryInfinitePageComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly scope = computed(
    () => this.queryParamMap().get('scope') ?? 'default',
  );

  readonly commentsQuery = injectInfiniteQuery(() => ({
    queryKey: ['comments', this.scope()],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      lastValueFrom(
        this.http.get<CommentsPageResponse>(
          `/api/v1/query-comments?scope=${encodeURIComponent(this.scope())}&cursor=${pageParam}&limit=3`,
        ),
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage: CommentsPageResponse) => lastPage.nextCursor,
    staleTime: 60_000,
  }));

  readonly allComments = computed(
    () => this.commentsQuery.data()?.pages.flatMap((p) => p.items) ?? [],
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
