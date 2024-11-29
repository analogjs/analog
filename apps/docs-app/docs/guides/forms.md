# Server Form Actions

Analog supports server-side handling of form submissions. This can be achieved by using a directive, and defining an async `action` function in `.server.ts` file for the page.

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

    @if( errors()?.email ) {
    <p>{{ errors()?.email }}</p>
    } } @else {
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
    console.log({ result });
  }
}
```

The `FormAction` directive submits the form data to the server, which is processed by its handler.

## Handling the Form Action

To handle the form action, define the `.server.ts` alongside the `.page.ts` file that contains the async `action` function to process the form submission.

In the server action, you can use access environment variables, read cookies, and perform other server-side only operations.

```ts
// src/app/pages/newsletter.server.ts
import {
  type PageServerAction,
  redirect,
  json,
  fail,
} from '@analogjs/router/server/actions';
import { readFormData } from 'h3';

export async function action({ event }: PageServerAction) {
  const body = await readFormData(event);
  const email = body.get('email') as string;

  if (!email) {
    return fail(422, { email: 'Email is required' });
  }

  if (email.length < 10) {
    return redirect('/');
  }

  console.log({ email: body.get('email') });

  return json({ type: 'success' });
}
```

- The `json` function returns a JSON response.
- The `redirect` function returns a redirect response to the client. This should be an absolute path.
- The `fail` function is used for returning form validation errors.
