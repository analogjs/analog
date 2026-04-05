import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  QueryClient,
  injectMutation,
  injectQuery,
} from '@tanstack/angular-query-experimental';
import {
  serverQueryOptions,
  serverMutationOptions,
} from '@analogjs/router/tanstack-query';

import type { route as commentsQueryRoute } from '../../server/routes/api/v1/query-comments.get';
import type { route as commentsMutationRoute } from '../../server/routes/api/v1/query-comments.post';
import type { InferRouteResult } from '@analogjs/router/server/actions';

type CommentsData = InferRouteResult<typeof commentsQueryRoute>;

function getIssueMessage(error: unknown): string {
  const err = error as { error?: unknown };
  if (err.error && Array.isArray(err.error)) {
    const firstIssue = err.error[0];
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
    <div class="space-y-6">
      <section
        class="rounded-box border border-base-300 bg-base-100 p-6 shadow-lg"
      >
        <div
          class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
        >
          <div class="space-y-3">
            <div class="badge badge-success badge-outline">
              Optimistic update demo
            </div>
            <div class="space-y-2">
              <h1 class="text-3xl font-black tracking-tight">
                Instant UI feedback with rollback support
              </h1>
              <p class="max-w-2xl text-base-content/70">
                Apply the optimistic comment locally, then either reconcile it
                with the server response or roll it back when validation fails.
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
              <div class="stat-title">Scope</div>
              <div class="stat-value text-lg capitalize">{{ scope() }}</div>
            </div>
          </div>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section
          class="rounded-box border border-base-300 bg-base-100 p-6 shadow-sm"
        >
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 class="text-xl font-semibold">Comment feed</h2>
              <p class="text-sm text-base-content/70">
                Optimistic items are tagged until the server settles.
              </p>
            </div>
            <div class="badge badge-outline">cache-first UX</div>
          </div>

          @if (commentsQuery.isPending()) {
            <div id="comments-loading" class="alert alert-info">
              <span>Loading comments...</span>
            </div>
          } @else if (commentsQuery.error()) {
            <div id="comments-error" class="alert alert-error">
              <span>Unable to load comments.</span>
            </div>
          } @else {
            <ul
              id="comments-list"
              class="menu gap-2 rounded-box bg-base-200 p-3"
            >
              @for (comment of comments(); track comment.id) {
                <li [attr.data-optimistic]="comment.optimistic ?? null">
                  <div
                    class="flex items-center justify-between gap-3 rounded-lg bg-base-100 px-4 py-3 shadow-sm"
                  >
                    <span>{{ comment.text }}</span>
                    @if (comment.optimistic) {
                      <span class="badge badge-warning badge-outline">
                        optimistic
                      </span>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </section>

        <aside class="space-y-4">
          <section
            class="rounded-box border border-base-300 bg-base-100 p-6 shadow-sm"
          >
            <h2 class="text-xl font-semibold">Try the mutation</h2>
            <p class="mt-2 text-sm text-base-content/70">
              Submit a valid comment to keep the optimistic item, or trigger a
              validation failure to watch the rollback state update.
            </p>

            <div class="mt-5 flex flex-col gap-3 sm:flex-row lg:flex-col">
              <button
                id="add-comment"
                type="button"
                class="btn btn-primary"
                (click)="addComment('Great post!')"
              >
                Add Comment
              </button>
              <button
                id="add-bad-comment"
                type="button"
                class="btn btn-outline btn-error"
                (click)="addComment('')"
              >
                Add Bad Comment
              </button>
            </div>
          </section>

          @if (mutationError()) {
            <div id="mutation-error" class="alert alert-error shadow-sm">
              <span>{{ mutationError() }}</span>
            </div>
          }

          <div class="flex flex-wrap gap-2">
            <p
              id="rolled-back"
              class="badge badge-error"
              [hidden]="!rolledBack()"
            >
              rolled-back
            </p>
            <p
              id="optimistic-applied"
              class="badge badge-warning"
              [hidden]="!optimisticApplied()"
            >
              optimistic-applied
            </p>
          </div>
        </aside>
      </div>
    </div>
  `,
})
export default class TanStackQueryOptimisticPageComponent {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly queryParamMap = toSignal(this.activatedRoute.queryParamMap, {
    initialValue: this.activatedRoute.snapshot.queryParamMap,
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

  readonly commentsQuery = injectQuery(() =>
    serverQueryOptions<typeof commentsQueryRoute>(
      this.http,
      '/api/v1/query-comments',
      {
        queryKey: this.queryKey(),
        query: { scope: this.scope(), cursor: 0, limit: 10 },
        staleTime: 60_000,
      },
    ),
  );

  readonly createCommentMutation = injectMutation(() =>
    serverMutationOptions<typeof commentsMutationRoute>(
      this.http,
      '/api/v1/query-comments',
      {
        onMutate: async (variables) => {
          this.mutationError.set('');
          this.rolledBack.set(false);
          this.optimisticApplied.set(true);

          const pinnedKey = this.queryKey();

          await this.queryClient.cancelQueries({ queryKey: pinnedKey });

          const snapshot =
            this.queryClient.getQueryData<CommentsData>(pinnedKey);

          this.queryClient.setQueryData<CommentsData>(pinnedKey, (old) => {
            if (!old) return old;
            return {
              ...old,
              items: [
                ...old.items,
                {
                  id: `optimistic-${Date.now()}`,
                  text: variables.text,
                  optimistic: true,
                },
              ],
            };
          });

          return { snapshot, pinnedKey };
        },
        onError: (error, _variables, context) => {
          const ctx = context as
            | {
                snapshot: CommentsData | undefined;
                pinnedKey: readonly string[];
              }
            | undefined;
          if (ctx?.snapshot) {
            this.queryClient.setQueryData(ctx.pinnedKey, ctx.snapshot);
          }
          this.mutationError.set(getIssueMessage(error));
          this.rolledBack.set(true);
        },
        onSettled: (_data, _error, _variables, context) => {
          const ctx = context as { pinnedKey: readonly string[] } | undefined;
          return this.queryClient.invalidateQueries({
            queryKey: ctx?.pinnedKey ?? this.queryKey(),
          });
        },
      },
    ),
  );

  readonly fetchCount = computed(
    () => this.commentsQuery.data()?.fetchCount ?? 0,
  );

  readonly comments = computed(() => this.commentsQuery.data()?.items ?? []);

  addComment(text: string) {
    this.createCommentMutation.mutate({ scope: this.scope(), text });
  }
}
