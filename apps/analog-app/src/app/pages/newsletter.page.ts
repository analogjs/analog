import { Component, signal } from '@angular/core';

import { FormAction } from '@analogjs/router';

import { type NewsletterSubmitResponse } from './newsletter.server';

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

    @if (signedUpEmail()) {
      <div id="signup-message">
        Thanks for signing up, {{ signedUpEmail() }}!
      </div>
    } @else {
      <form
        method="post"
        (onSuccess)="onSuccess($any($event))"
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
    }
  `,
})
export default class NewsletterComponent {
  signedUpEmail = signal('');
  errors = signal<FormErrors>(undefined);

  onSuccess(res: NewsletterSubmitResponse) {
    this.signedUpEmail.set(res.email);
  }

  onError(result?: FormErrors) {
    this.errors.set(result);
    console.log({ result });
  }
}
