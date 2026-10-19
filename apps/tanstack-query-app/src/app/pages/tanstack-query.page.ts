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

import type { route as todosQueryRoute } from '../../server/routes/api/v1/query-todos.get';
import type { route as todosMutationRoute } from '../../server/routes/api/v1/query-todos.post';

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

  return 'Unable to create todo.';
}

@Component({
  selector: 'analogjs-tanstack-query-page',
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
            <div class="badge badge-primary badge-outline">Basic demo</div>
            <div class="space-y-2">
              <h1 class="text-3xl font-black tracking-tight">
                Query hydration and mutation invalidation
              </h1>
              <p class="max-w-2xl text-base-content/70">
                This route renders todos on the server, hydrates them on the
                client, then invalidates the query after a successful mutation.
              </p>
            </div>
          </div>

          <div
            class="stats stats-vertical border border-base-300 bg-base-200 shadow-sm sm:stats-horizontal"
          >
            <div class="stat">
              <div class="stat-title">Scope</div>
              <div id="todo-scope" class="stat-value text-lg capitalize">
                {{ scope() }}
              </div>
              <div class="stat-desc">Isolates request state per test run</div>
            </div>
            <div class="stat">
              <div class="stat-title">Fetch count</div>
              <div id="todo-fetch-count" class="stat-value text-primary">
                {{ fetchCount() }}
              </div>
              <div class="stat-desc">Should stay hydrated on first paint</div>
            </div>
          </div>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section
          class="rounded-box border border-base-300 bg-base-100 p-6 shadow-sm"
        >
          <div class="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-semibold">Todos</h2>
              <p class="text-sm text-base-content/70">
                Server data stays visible while mutations update the cache.
              </p>
            </div>
            <div class="badge badge-neutral badge-outline">SSR + mutation</div>
          </div>

          @if (todosQuery.isPending()) {
            <div id="todo-loading" class="alert alert-info">
              <span>Loading todos...</span>
            </div>
          } @else if (todosQuery.error()) {
            <div id="todo-query-error" class="alert alert-error">
              <span>Unable to load todos.</span>
            </div>
          } @else {
            <ul id="todo-list" class="menu gap-2 rounded-box bg-base-200 p-3">
              @for (todo of todos(); track todo.id) {
                <li>
                  <div
                    class="flex items-center justify-between rounded-lg bg-base-100 px-4 py-3 shadow-sm"
                  >
                    <span>{{ todo.title }}</span>
                    <span class="badge badge-ghost">cached</span>
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
            <h2 class="text-xl font-semibold">Mutation actions</h2>
            <p class="mt-2 text-sm text-base-content/70">
              Add a valid todo to trigger an invalidation or submit an empty
              title to surface server validation feedback.
            </p>

            <div class="mt-5 flex flex-col gap-3 sm:flex-row lg:flex-col">
              <button
                id="add-todo"
                type="button"
                class="btn btn-primary"
                (click)="createTodo('Ship query support')"
              >
                Add Todo
              </button>
              <button
                id="add-empty-todo"
                type="button"
                class="btn btn-outline btn-error"
                (click)="createTodo('')"
              >
                Add Empty Todo
              </button>
            </div>
          </section>

          @if (mutationError()) {
            <div id="todo-mutation-error" class="alert alert-error shadow-sm">
              <span>{{ mutationError() }}</span>
            </div>
          }

          <section
            class="rounded-box border border-dashed border-base-300 bg-base-100 p-6 text-sm text-base-content/70"
          >
            The UI keeps the network state visible for demos and e2e tests: the
            list, fetch count, and mutation errors all use stable IDs.
          </section>
        </aside>
      </div>
    </div>
  `,
})
export default class TanStackQueryPageComponent {
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

  readonly todosQuery = injectQuery(() =>
    serverQueryOptions<typeof todosQueryRoute>(
      this.http,
      '/api/v1/query-todos',
      {
        queryKey: ['analog-query-todos', this.scope()] as const,
        query: { scope: this.scope() },
        staleTime: 60_000,
      },
    ),
  );

  readonly createTodoMutation = injectMutation(() =>
    serverMutationOptions<typeof todosMutationRoute>(
      this.http,
      '/api/v1/query-todos',
      {
        onMutate: () => {
          this.mutationError.set('');
        },
        onSuccess: (_data, variables) => {
          return this.queryClient.invalidateQueries({
            queryKey: ['analog-query-todos', variables?.scope ?? this.scope()],
          });
        },
        onError: (error) => {
          this.mutationError.set(getIssueMessage(error));
        },
      },
    ),
  );

  readonly fetchCount = computed(() => this.todosQuery.data()?.fetchCount ?? 0);
  readonly todos = computed(() => this.todosQuery.data()?.items ?? []);

  createTodo(title: string) {
    this.createTodoMutation.mutate({ scope: this.scope(), title });
  }
}
