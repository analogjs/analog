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
    <h3>TanStack Query</h3>

    <p id="todo-scope">{{ scope() }}</p>

    @if (todosQuery.isPending()) {
      <p id="todo-loading">Loading todos...</p>
    } @else if (todosQuery.error()) {
      <p id="todo-query-error">Unable to load todos.</p>
    } @else {
      <p id="todo-fetch-count">{{ fetchCount() }}</p>

      <ul id="todo-list">
        @for (todo of todos(); track todo.id) {
          <li>{{ todo.title }}</li>
        }
      </ul>
    }

    <button
      id="add-todo"
      type="button"
      (click)="createTodo('Ship query support')"
    >
      Add Todo
    </button>
    <button id="add-empty-todo" type="button" (click)="createTodo('')">
      Add Empty Todo
    </button>

    @if (mutationError()) {
      <p id="todo-mutation-error">{{ mutationError() }}</p>
    }
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
