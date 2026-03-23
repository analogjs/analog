import { Component, signal } from '@angular/core';
import { FormAction } from '@analogjs/router';

import { type NewsletterSubmitResponse } from './newsletter.server';

type FormErrors =
  | {
      email?: string;
    }
  | undefined;

@Component({
  selector: 'analogjs-newsletter-page',
  standalone: true,
  imports: [FormAction],
  template: `
    <section class="card card-border bg-base-100 shadow-xl">
      <div class="card-body gap-6">
        <div class="space-y-3">
          <div class="badge badge-secondary badge-outline">Newsletter</div>
          <h1 class="card-title text-3xl">Newsletter signup</h1>
        </div>

        @if (signedUpEmail()) {
          <div
            id="signup-message"
            role="alert"
            class="alert alert-success alert-soft"
          >
            <span>Thanks for signing up, {{ signedUpEmail() }}!</span>
          </div>
        } @else {
          <form
            class="space-y-4"
            method="post"
            (onSuccess)="onSuccess($any($event))"
            (onError)="onError($any($event))"
            (onStateChange)="errors.set(undefined)"
          >
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Email</legend>
              <input
                class="input w-full md:max-w-lg"
                type="email"
                name="email"
                id="email"
              />
            </fieldset>

            <div class="card-actions justify-start">
              <button class="btn btn-primary" type="submit">Submit</button>
            </div>
          </form>

          @if (errors()?.email) {
            <div role="alert" class="alert alert-error alert-soft">
              <span>{{ errors()?.email }}</span>
            </div>
          }
        }
      </div>
    </section>
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
