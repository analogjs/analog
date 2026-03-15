import { Component, signal } from '@angular/core';

import { type NewsletterSubmitResponse } from './newsletter.server';

type FormErrors =
  | {
      email?: string;
    }
  | undefined;

@Component({
  selector: 'analogjs-newsletter-page',
  standalone: true,
  template: `
    <h3>Newsletter Signup</h3>

    @if (signedUpEmail()) {
      <div id="signup-message">
        Thanks for signing up, {{ signedUpEmail() }}!
      </div>
    } @else {
      <form (submit)="submit($event)">
        <div>
          <label for="email"> Email </label>
          <input type="email" name="email" />
        </div>

        <button class="button" type="submit">Submit</button>
      </form>

      @if (errors()?.email) {
        <p>{{ errors()?.email }}</p>
      }
    }
  `,
})
export default class NewsletterComponent {
  signedUpEmail = signal('');
  errors = signal<FormErrors>(undefined);

  async submit(event: SubmitEvent) {
    event.preventDefault();
    this.errors.set(undefined);

    const form = event.target as HTMLFormElement;
    const body = new FormData(form);
    const response = await fetch(
      `/api/_analog/pages${window.location.pathname}`,
      {
        method: 'POST',
        body,
      },
    );

    if (response.redirected) {
      window.location.assign(new URL(response.url).pathname);
      return;
    }

    if (response.ok) {
      this.onSuccess((await response.json()) as NewsletterSubmitResponse);
      return;
    }

    if (response.headers.get('X-Analog-Errors')) {
      this.onError((await response.json()) as FormErrors);
    }
  }

  onSuccess(res: NewsletterSubmitResponse) {
    this.signedUpEmail.set(res.email);
  }

  onError(result?: FormErrors) {
    this.errors.set(result);
    console.log({ result });
  }
}
