# Form Server Actions

Analog supports server-side handling of form submissions and validation.

<div class="video-container">
  <div class="video-responsive-wrapper">
    <iframe
      width="560"
      height="315"
      title="Form Server Actions in Analog"
      src="https://www.youtube.com/embed/4pFPO1OpD4Q?si=HcESaJI03LgEljpQ&amp;controls=0"
      allowfullscreen>
    </iframe>
  </div>
</div>

## Setting up the Form

To handle form submissions, use the `FormAction` directive from the `@analogjs/router` package. The directive collects the `FormData` and submits it using the form's method and destination.

The directive emits after processing the form:

- `onSuccess`: when the form is processing on the server and returns a success response.
- `onError`: when the form returns an error response.
- `state`: emits `submitting`, `success`, `error`, `redirect`, or `navigate` as the submission progresses.

The example page below submits an email for a newsletter signup.

```ts
// src/app/pages/newsletter.page.ts
type FormErrors =
  | {
      email?: string;
    }
  | undefined;

@Component({
  selector: 'app-newsletter-page',
  imports: [FormAction],
  template: `
    <h3>Newsletter Signup</h3>

    @if (!signedUp()) {
      <form
        method="post"
        (onSuccess)="onSuccess()"
        (onError)="onError($any($event))"
        (state)="$event === 'submitting' && errors.set(undefined)"
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

### Submission Destinations and State

Without an explicit `action`, POST submissions use the current page's server
endpoint and GET submissions navigate to the current route. Set `action` or bind
`[action]` to choose a different destination:

```html
<form method="post" action="/api/newsletter">
  <input type="email" name="email" />
  <button type="submit">Subscribe</button>
</form>
```

GET forms retain the destination's query parameters and fragment, and preserve
repeated field names as multiple query values. POST forms retain repeated values
in `FormData`. Same-origin destinations and redirects use Angular navigation;
external navigation uses the browser. Redirects retain their query parameters
and fragment.

The directive sets `data-state="idle"` initially, updates it during submission,
and sets `aria-busy="true"` while awaiting a response. You can style these
attributes or subscribe to the `state` output. `FormActionState` is exported for
typing state handlers. Response parsing and network failures emit `error` and
clear the busy state.

## Handling the Form Action

To handle the form action, define the `.server.ts` alongside the `.page.ts` file that contains the async `action` function to process the form submission.

In the server action, you can use access environment variables, read cookies, and perform other server-side only operations.

```ts
// src/app/pages/newsletter.server.ts
export async function action({ event }: PageServerAction) {
  const body = await readFormData(event);
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

### Validating a Form Action with a Schema

Use `defineAction` to parse JSON or form data and validate it with a Standard
Schema-compatible library, such as Zod 3.24+ or Valibot. The handler receives the
schema's inferred output type, including transformed values.

```ts
// src/app/pages/newsletter.server.ts
import { defineAction, json } from '@analogjs/router/server/actions';
import { z } from 'zod';

export const action = defineAction({
  schema: z.object({ email: z.string().email() }),
  handler: ({ data }) => json({ email: data.email }),
});
```

An optional `params` schema validates route parameters. The handler also receives
`params`, `req`, `res`, `fetch`, and `event`, just like a regular `PageServerAction`.
Both synchronous and asynchronous schemas are supported. Without a `schema`,
`data` contains the parsed request body.

Invalid input returns HTTP 422 with the `X-Analog-Errors` header and an array of
Standard Schema issues. The handler is not called. The existing `FormAction`
directive emits this array through `onError`; each issue includes a `message` and
an optional `path`. Existing actions returning `fail()` keep their own error shape.

Repeated form fields are preserved as arrays, including file fields. Empty or
unparseable bodies fall back to `{}`, which is then validated by the schema.

### Displaying Validation Errors

Use `issuesToFieldErrors` and `issuesToFormErrors` to display the issues returned
by `defineAction`. Field paths become dot-separated names, and multiple messages
for the same field remain in order. Issues without a path are form-level errors.

```ts
import { signal } from '@angular/core';
import {
  issuesToFieldErrors,
  issuesToFormErrors,
  type ValidationFieldErrors,
} from '@analogjs/router';
import type { StandardSchemaV1 } from '@analogjs/router/server/actions';

// Inside the component handling a defineAction form:
fieldErrors = signal<ValidationFieldErrors>({});
formErrors = signal<string[]>([]);

onError(result: unknown) {
  // This form's defineAction handler returns Standard Schema issues.
  const issues = result as ReadonlyArray<StandardSchemaV1.Issue>;
  this.fieldErrors.set(issuesToFieldErrors(issues));
  this.formErrors.set(issuesToFormErrors(issues));
}
```

Bind `(onError)="onError($event)"` on the form and render the messages:

```html
@for (message of fieldErrors()['email'] ?? []; track $index) {
<p>{{ message }}</p>
} @for (message of formErrors(); track $index) {
<p>{{ message }}</p>
}
```

`issuePathToFieldName(['profile', { key: 'name' }, 0])` returns
`'profile.name.0'` when you need to normalize an individual issue path. These
helpers accept Standard Schema issue arrays; existing actions that return custom
error objects with `fail()` can keep their existing error handlers.

Field names use dots to separate path segments without escaping. A literal key
such as `['profile.name']` and a nested path `['profile', 'name']` both map to
`'profile.name'`. If your schema distinguishes these keys, use the original issue
paths to display their messages separately.

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
  const body = await readFormData(event);
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
@Component({
  selector: 'app-search-page',
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

The query parameter can be accessed through the server form action.

```ts
// src/app/pages/search.server.ts
export async function load({ event }: PageServerLoad) {
  const query = getQuery(event);
  console.log('loaded search', query['search']);

  return {
    loaded: true,
    searchTerm: `${query['search']}`,
  };
}
```
