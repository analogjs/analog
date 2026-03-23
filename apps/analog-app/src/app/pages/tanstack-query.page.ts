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

type Todo = {
  id: string;
  title: string;
};

type TodoListResponse = {
  fetchCount: number;
  items: Todo[];
};

type TodoCreateResponse = {
  created: true;
  item: Todo;
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

  readonly todosQuery = injectQuery(() => ({
    queryKey: ['analog-query-todos', this.scope()],
    queryFn: () =>
      lastValueFrom(
        this.http.get<TodoListResponse>('/api/v1/query-todos', {
          params: { scope: this.scope() },
        }),
      ),
    staleTime: 60_000,
  }));

  readonly createTodoMutation = injectMutation(() => ({
    mutationFn: (title: string) =>
      lastValueFrom(
        this.http.post<TodoCreateResponse>('/api/v1/query-todos', {
          scope: this.scope(),
          title,
        }),
      ),
    onMutate: () => {
      this.mutationError.set('');
    },
    onSuccess: () => {
      return this.queryClient.invalidateQueries({
        queryKey: ['analog-query-todos', this.scope()],
      });
    },
    onError: (error: HttpErrorResponse) => {
      this.mutationError.set(getIssueMessage(error));
    },
  }));

  readonly fetchCount = computed(() => this.todosQuery.data()?.fetchCount ?? 0);
  readonly todos = computed(() => this.todosQuery.data()?.items ?? []);

  createTodo(title: string) {
    this.createTodoMutation.mutate(title);
  }
}
