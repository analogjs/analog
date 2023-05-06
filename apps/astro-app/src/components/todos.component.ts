import { Component, OnInit, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { provideHttpClient, HttpClient } from '@angular/common/http';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

@Component({
  selector: 'app-todos',
  standalone: true,
  imports: [NgFor],
  template: `
    <h2>Todos</h2>

    <ul>
      <li *ngFor="let todo of todos">
        {{ todo.title }}
      </li>
    </ul>
  `,
})
export class TodosComponent implements OnInit {
  static clientProviders = [provideHttpClient()];

  http = inject(HttpClient);
  todos: Todo[] = [];

  ngOnInit() {
    this.http
      .get<Todo[]>('https://jsonplaceholder.typicode.com/todos')
      .subscribe((todos) => (this.todos = todos));
  }
}
