import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import {
  QueryClient,
  injectMutation,
  injectQuery,
} from '@analogjs/router/query';

type Comment = {
  id: string;
  text: string;
  optimistic?: boolean;
};

type CommentsResponse = {
  fetchCount: number;
  items: Comment[];
  nextCursor: number | null;
};

type CommentCreateResponse = {
  created: true;
  item: Comment;
};

function getIssueMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse && Array.isArray(error.error)) {
    const firstIssue = error.error[0];
    if (
      typeof firstIssue === 'object' &&
      firstIssue !== null &&
      typeof (firstIssue as { message?: unknown }).message === 'string'
    ) {
      return (firstIssue as { message: string }).message;
    }
  }

  return 'Unable to create comment.';
}

@Component({
  selector: 'analogjs-tanstack-query-optimistic-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Optimistic Updates Demo</h3>

    @if (commentsQuery.isPending()) {
      <p id="comments-loading">Loading comments...</p>
    } @else if (commentsQuery.error()) {
      <p id="comments-error">Unable to load comments.</p>
    } @else {
      <p id="comments-fetch-count">{{ fetchCount() }}</p>

      <ul id="comments-list">
        @for (comment of comments(); track comment.id) {
          <li [attr.data-optimistic]="comment.optimistic ?? null">
            {{ comment.text }}
          </li>
        }
      </ul>
    }

    <button id="add-comment" type="button" (click)="addComment('Great post!')">
      Add Comment
    </button>
    <button id="add-bad-comment" type="button" (click)="addComment('')">
      Add Bad Comment
    </button>

    @if (mutationError()) {
      <p id="mutation-error">{{ mutationError() }}</p>
    }

    <p id="rolled-back" [hidden]="!rolledBack()">rolled-back</p>
    <p id="optimistic-applied" [hidden]="!optimisticApplied()">
      optimistic-applied
    </p>
  `,
})
export default class TanStackQueryOptimisticPageComponent {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly scope = computed(
    () => this.queryParamMap().get('scope') ?? 'default',
  );
  readonly mutationError = signal('');
  readonly rolledBack = signal(false);
  readonly optimisticApplied = signal(false);

  private readonly queryKey = computed(
    () => ['optimistic-comments', this.scope()] as const,
  );

  readonly commentsQuery = injectQuery(() => ({
    queryKey: this.queryKey(),
    queryFn: () =>
      lastValueFrom(
        this.http.get<CommentsResponse>(
          `/api/v1/query-comments?scope=${encodeURIComponent(this.scope())}&cursor=0&limit=10`,
        ),
      ),
    staleTime: 60_000,
  }));

  readonly createCommentMutation = injectMutation(() => ({
    mutationFn: (text: string) =>
      lastValueFrom(
        this.http.post<CommentCreateResponse>('/api/v1/query-comments', {
          scope: this.scope(),
          text,
        }),
      ),
    onMutate: async (text: string) => {
      this.mutationError.set('');
      this.rolledBack.set(false);
      this.optimisticApplied.set(true);

      await this.queryClient.cancelQueries({ queryKey: this.queryKey() });

      const snapshot = this.queryClient.getQueryData<CommentsResponse>(
        this.queryKey(),
      );

      this.queryClient.setQueryData<CommentsResponse>(
        this.queryKey(),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: [
              ...old.items,
              { id: `optimistic-${Date.now()}`, text, optimistic: true },
            ],
          };
        },
      );

      return { snapshot };
    },
    onError: (
      error: HttpErrorResponse,
      _variables: string,
      context: { snapshot: CommentsResponse | undefined } | undefined,
    ) => {
      if (context?.snapshot) {
        this.queryClient.setQueryData(this.queryKey(), context.snapshot);
      }
      this.mutationError.set(getIssueMessage(error));
      this.rolledBack.set(true);
    },
    onSettled: () => {
      return this.queryClient.invalidateQueries({ queryKey: this.queryKey() });
    },
  }));

  readonly fetchCount = computed(
    () => this.commentsQuery.data()?.fetchCount ?? 0,
  );

  readonly comments = computed(() => this.commentsQuery.data()?.items ?? []);

  addComment(text: string) {
    this.createCommentMutation.mutate(text);
  }
}
