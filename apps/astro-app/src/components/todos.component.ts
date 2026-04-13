import { Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { NgFor } from '@angular/common';
import { provideHttpClient, HttpClient } from '@angular/common/http';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

@Component({
  selector: 'app-todos',
  template: `
    <h2>Todos</h2>

    <ul>
      @for (todo of todos(); track todo.id) {
        <li>
          {{ todo.title }}
          @if (todo.completed) {
            ✅
          }
        </li>
      }
    </ul>
  `,
})
export class TodosComponent implements OnInit {
  static clientProviders = [provideHttpClient()];
  static renderProviders = [TodosComponent.clientProviders];
  http = inject(HttpClient);
  todos = signal<Todo[]>([]);

  ngOnInit() {
    this.http
      .get<Todo[]>('https://jsonplaceholder.typicode.com/todos')
      .subscribe((todos) => this.todos.set(todos));
  }
}
