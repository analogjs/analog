---
title: Data Fetching in Analog - Complete Guide to HTTP Requests
description: Learn how to implement data fetching in Analog using HttpClient, server context, and request interceptors. Understand server-side and client-side data loading patterns.
keywords:
  [
    'data fetching',
    'HttpClient',
    'API requests',
    'server context',
    'request interceptors',
    'Angular HTTP',
    'server-side data',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/features/data-fetching/overview
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Data Fetching
tags: ['data-fetching', 'http', 'api', 'requests']
---

# Overview

Data fetching in Analog builds on top of concepts in Angular, such as using `HttpClient` for making API requests.

## Using HttpClient

Using `HttpClient` is the recommended way to make API requests for internal and external endpoints. The context for the request is provided by the `provideServerContext` function for any request that uses `HttpClient` and begins with a `/`.

## Server Request Context

On the server, use the `provideServerContext` function from the Analog router in the `main.server.ts`.

```ts title="main.server.ts - Server context configuration"
import 'zone.js/node';
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';

// Analog server context
import { provideServerContext } from '@analogjs/router/server';
import { ServerContext } from '@analogjs/router/tokens';

import { config } from './app/app.config.server';
import { AppComponent } from './app/app.component';

if (import.meta.env.PROD) {
  enableProdMode();
}

export function bootstrap() {
  return bootstrapApplication(AppComponent, config);
}

export default async function render(
  url: string,
  document: string,
  serverContext: ServerContext,
) {
  const html = await renderApplication(bootstrap, {
    document,
    url,
    platformProviders: [provideServerContext(serverContext)],
  });

  return html;
}
```

This provides the `Request` and `Response`, and `Base URL` from the server and registers them as providers that can be injected and used.

## Injection Functions

```ts title="Service using injection functions"
import { inject } from '@angular/core';
import {
  injectRequest,
  injectResponse,
  injectBaseURL,
} from '@analogjs/router/tokens';

class MyService {
  request = injectRequest(); // <- Server Request Object
  response = injectResponse(); // <- Server Response Object
  baseUrl = injectBaseURL(); // <-- Server Base URL
}
```

## Request Context Interceptor

Analog also provides `requestContextInterceptor` for the HttpClient that handles transforming any request to URL beginning with a `/` to a full URL request on the server, client, and during prerendering.

Use it with the `withInterceptors` function from the `@angular/common/http` packages.

```ts title="app.config.ts - Request context interceptor setup"
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideFileRouter, requestContextInterceptor } from '@analogjs/router';
import { withNavigationErrorHandler } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(withNavigationErrorHandler(console.error)),
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor]),
    ),
    provideClientHydration(),
  ],
};
```

> Make sure the `requestContextInterceptor` is **last** in the array of interceptors.

## Making Requests

In your component/service, use `HttpClient` along with [API routes](/docs/features/api/overview) with providing a full URL.

### Basic API Integration

An example API route that fetches todos:

```ts
// src/server/routes/api/v1/todos.ts -> /api/v1/todos
import { eventHandler } from 'h3';

export default eventHandler(async () => {
  const response = await fetch('https://jsonplaceholder.typicode.com/todos');
  const todos = await response.json();

  return todos;
});
```

An example service that fetches todos from the API endpoint:

```ts
// todos.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Todo } from './todos';

@Injectable({
  providedIn: 'root',
})
export class TodosService {
  http = inject(HttpClient);

  getAll() {
    return this.http.get<Todo[]>('/api/v1/todos');
  }

  getData() {
    return this.http.get<Todo[]>('/assets/data.json');
  }
}
```

### Advanced Data Fetching Patterns

#### 1. CRUD Operations with Error Handling

```ts
// src/app/services/user.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, catchError, retry } from 'rxjs';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface CreateUserDto {
  name: string;
  email: string;
  role: string;
}

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private http = inject(HttpClient);
  private apiUrl = '/api/users';

  // GET all users
  getUsers(): Observable<User[]> {
    return this.http
      .get<User[]>(this.apiUrl)
      .pipe(retry(3), catchError(this.handleError));
  }

  // GET user by ID
  getUserById(id: number): Observable<User> {
    return this.http
      .get<User>(`${this.apiUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

  // POST create user
  createUser(user: CreateUserDto): Observable<User> {
    return this.http
      .post<User>(this.apiUrl, user)
      .pipe(catchError(this.handleError));
  }

  // PUT update user
  updateUser(id: number, user: Partial<User>): Observable<User> {
    return this.http
      .put<User>(`${this.apiUrl}/${id}`, user)
      .pipe(catchError(this.handleError));
  }

  // DELETE user
  deleteUser(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.apiUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
    }

    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}
```

#### 2. Component with Loading States and Error Handling

```ts
// src/app/pages/users/users.page.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UserService, User } from '../../services/user.service';
import { LoadingSpinnerComponent } from '../../components/loading-spinner.component';
import { ErrorMessageComponent } from '../../components/error-message.component';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent,
    ErrorMessageComponent,
  ],
  template: `
    <div class="users-container">
      <h1>Users</h1>

      @if (loading()) {
        <app-loading-spinner />
      } @else if (error()) {
        <app-error-message [message]="error()" (retry)="loadUsers()" />
      } @else {
        <div class="users-grid">
          @for (user of users(); track user.id) {
            <div class="user-card">
              <h3>{{ user.name }}</h3>
              <p>{{ user.email }}</p>
              <p class="role">{{ user.role }}</p>
              <a [routerLink]="['/users', user.id]">View Details</a>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .users-container {
        padding: 2rem;
      }

      .users-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }

      .user-card {
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 1rem;
        background: white;
      }

      .role {
        color: #666;
        font-size: 0.9rem;
      }
    `,
  ],
})
export default class UsersPageComponent implements OnInit {
  private userService = inject(UserService);

  users = signal<User[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading.set(true);
    this.error.set(null);

    this.userService.getUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });
  }
}
```

#### 3. Server-Side Data Fetching with PageServerLoad

```ts
// src/app/pages/users/[id].page.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageServerLoad } from '@analogjs/router';
import { UserService, User } from '../../services/user.service';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const userId = params['id'];

  // Fetch user data on the server
  const user = await fetch<User>(`/api/users/${userId}`);

  return {
    user,
    userId,
  };
};

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (user()) {
      <div class="user-detail">
        <h1>{{ user()?.name }}</h1>
        <div class="user-info">
          <p><strong>Email:</strong> {{ user()?.email }}</p>
          <p><strong>Role:</strong> {{ user()?.role }}</p>
        </div>
        <a routerLink="/users">Back to Users</a>
      </div>
    } @else {
      <p>User not found</p>
    }
  `,
})
export default class UserDetailComponent {
  private route = inject(ActivatedRoute);
  user = toSignal(this.route.data.pipe(map((data) => data['user'])));
}
```

#### 4. Real-time Data with WebSockets

```ts
// src/app/services/realtime.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';

interface Notification {
  id: string;
  message: string;
  timestamp: Date;
  type: 'info' | 'warning' | 'error';
}

@Injectable({
  providedIn: 'root',
})
export class RealtimeService {
  private http = inject(HttpClient);
  private ws: WebSocket | null = null;
  private notificationsSubject = new Subject<Notification>();

  notifications$ = this.notificationsSubject.asObservable();

  connect(userId: string) {
    this.ws = new WebSocket(`ws://localhost:3000/ws/${userId}`);

    this.ws.onmessage = (event) => {
      const notification: Notification = JSON.parse(event.data);
      this.notificationsSubject.next(notification);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendMessage(message: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ message }));
    }
  }
}
```

#### 5. Caching and State Management

```ts
// src/app/services/cache.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class CacheService {
  private http = inject(HttpClient);
  private cache = new Map<
    string,
    { data: any; timestamp: number; ttl: number }
  >();

  get<T>(url: string, ttl: number = 5 * 60 * 1000): Observable<T> {
    const cached = this.cache.get(url);
    const now = Date.now();

    if (cached && now - cached.timestamp < cached.ttl) {
      return of(cached.data);
    }

    return this.http.get<T>(url).pipe(
      shareReplay(1),
      switchMap((data) => {
        this.cache.set(url, { data, timestamp: now, ttl });
        return of(data);
      }),
    );
  }

  invalidate(url: string) {
    this.cache.delete(url);
  }

  clear() {
    this.cache.clear();
  }
}
```

### TransferState and SSR

Data requests use Angular's `TransferState` to store any requests made during Server-Side Rendering, and are transferred to prevent an additional request during the initial client-side hydration.

```ts
// src/app/services/ssr-friendly.service.ts
import { Injectable, inject, makeStateKey, TransferState } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

const USERS_KEY = makeStateKey<User[]>('users');

@Injectable({
  providedIn: 'root',
})
export class SsrFriendlyService {
  private http = inject(HttpClient);
  private transferState = inject(TransferState);

  getUsers(): Observable<User[]> {
    // Check if we have cached data from SSR
    const cached = this.transferState.get(USERS_KEY, []);

    if (cached.length > 0) {
      // Use cached data and remove it from transfer state
      this.transferState.remove(USERS_KEY);
      return of(cached);
    }

    // Fetch fresh data and cache it for SSR
    return this.http.get<User[]>('/api/users').pipe(
      tap((users) => {
        this.transferState.set(USERS_KEY, users);
      }),
    );
  }
}
```
