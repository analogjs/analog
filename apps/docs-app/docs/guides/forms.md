# Form Server Actions

Analog supports server-side handling of form submissions and validation.

`FormAction` is a good fit when you want progressive-enhancement-style form
submissions that post directly to a page action. If you need client-managed
mutation state, cache invalidation, or optimistic updates, use TanStack Query
mutations against an Analog server route instead.

<div className="video-container">
  <div className="video-responsive-wrapper">
    <iframe
      width="560"
      height="315"
      src="https://www.youtube.com/embed/4pFPO1OpD4Q?si=HcESaJI03LgEljpQ&amp;controls=0">
    </iframe>
  </div>
</div>

## Setting up the Form

To handle form submissions, use the `FormAction` directive from the `@analogjs/router` package. The directives handles collecting the `FormData` and sending a `POST` request to the server.

The directive emits after processing the form:

- `onSuccess`: when the form is processing on the server and returns a success response.
- `onError`: when the form returns an error response.
- `onStateChange`: when the form is submitted.

The example page below submits an email for a newsletter signup.

```ts
// src/app/pages/newsletter.page.ts
import { Component, signal } from '@angular/core';

import { FormAction } from '@analogjs/router';

type FormErrors =
  | {
      email?: string;
    }
  | undefined;

@Component({
  selector: 'app-newsletter-page',
  standalone: true,
  imports: [FormAction],
  template: `
    <h3>Newsletter Signup</h3>

    @if (!signedUp()) {
      <form
        method="post"
        (onSuccess)="onSuccess()"
        (onError)="onError($any($event))"
        (onStateChange)="errors.set(undefined)"
      >
        <div>
          <label for="email"> Email </label>
          <input type="email" name="email" />
        </div>

        <button class="button" type="submit">Submit</button>
      </form>

      @if (errors()?.email) {
        <p>{{ errors()?.email }}</p>
      }
    } @else {
      <div>Thanks for signing up!</div>
    }
  `,
})
export default class NewsletterComponent {
  signedUp = signal(false);
  errors = signal<FormErrors>(undefined);

  onSuccess() {
    this.signedUp.set(true);
  }

  onError(result?: FormErrors) {
    this.errors.set(result);
  }
}
```

The `FormAction` directive submits the form data to the server, which is processed by its handler.

## Handling the Form Action

To handle the form action, define the `.server.ts` alongside the `.page.ts` file that contains the async `action` function to process the form submission.

In the server action, you can access environment variables, read cookies, and perform other server-side only operations.

```ts
// src/app/pages/newsletter.server.ts
import {
  type PageServerAction,
  redirect,
  json,
  fail,
} from '@analogjs/router/server/actions';

export async function action({ event }: PageServerAction) {
  const body = await event.req.formData();
  const email = body.get('email') as string;

  if (!email) {
    return fail(422, { email: 'Email is required' });
  }

  if (email.length < 10) {
    return redirect('/');
  }

  return json({ type: 'success' });
}
```

- The `json` function returns a JSON response.
- The `redirect` function returns a redirect response to the client. This should be an absolute path.
- The `fail` function is used for returning form validation errors.

### Handling Multiple Forms

To handle multiple forms on the same page, add a hidden input to distinguish each form.

```html
<form method="post">
  <div>
    <label for="email"> Email </label>
    <input type="email" name="email" />
  </div>

  <input type="hidden" name="action" value="register" />

  <button class="button" type="submit">Submit</button>
</form>
```

In the server action, use the `action` value.

```ts
export async function action({ event }: PageServerAction) {
  const body = await event.req.formData();
  const action = body.get('action') as string;

  if (action === 'register') {
    // process register form
  }
}
```

## Handling GET Requests

Forms with a `GET` action can be used to navigate to the same URL, with the form inputs passed as query parameters.

The example below defines a search form with the `search` field as a query param.

```ts
// src/app/pages/search.page.ts
import { Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad, FormAction } from '@analogjs/router';

import type { load } from './search.server';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [FormAction],
  template: `
    <h3>Search</h3>

    <form method="get">
      <div>
        <label for="search"> Search </label>
        <input type="text" name="search" [value]="searchTerm()" />
      </div>

      <button class="button" type="submit">Submit</button>
    </form>

    @if (searchTerm()) {
      <p>Search Term: {{ searchTerm() }}</p>
    }
  `,
})
export default class NewsletterComponent {
  loader = toSignal(injectLoad<typeof load>(), { requireSync: true });
  searchTerm = computed(() => this.loader().searchTerm);
}
```

The query parameter can be accessed through the server load function.

```ts
// src/app/pages/search.server.ts
import type { PageServerLoad } from '@analogjs/router';

export async function load({ event }: PageServerLoad) {
  const searchTerm = event.url.searchParams.get('search') ?? '';
  console.log('loaded search', searchTerm);

  return {
    loaded: true,
    searchTerm,
  };
}
```

## TanStack Query Mutations

When a form submission needs to invalidate cached queries or participate in a
broader client-side server-state flow, use `injectMutation` with an Analog
server route.

```ts
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { QueryClient, injectMutation } from '@analogjs/router/query';

@Component({
  standalone: true,
  template: `
    <button type="button" (click)="save()">Save</button>
    @if (error()) {
      <p>{{ error() }}</p>
    }
  `,
})
export default class MutationExampleComponent {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);

  readonly error = signal('');

  readonly mutation = injectMutation(() => ({
    mutationFn: () =>
      lastValueFrom(
        this.http.post('/api/v1/query-todos', {
          scope: 'docs',
          title: 'Write docs',
        }),
      ),
    onSuccess: () =>
      this.queryClient.invalidateQueries({
        queryKey: ['analog-query-todos', 'docs'],
      }),
    onError: (err: HttpErrorResponse) => {
      this.error.set(err.message);
    },
  }));

  save() {
    this.error.set('');
    this.mutation.mutate();
  }
}
```
