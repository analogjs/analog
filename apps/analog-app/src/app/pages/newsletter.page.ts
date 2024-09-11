import { Component, signal } from '@angular/core';

import { FormActionDirective } from './form-action.directive';
import type { action } from './newsletter.server';

@Component({
  selector: 'app-newsletter-page',
  standalone: true,
  imports: [FormActionDirective],
  template: `
    <h3>Newsletter Signup</h3>

    @if (!signedUp()) {
    <form
      method="post"
      (onSuccess)="onSuccess($event)"
      (onError)="onError($event)"
    >
      <div>
        <label for="email"> Email </label>
        <input type="email" name="email" />
      </div>

      <button class="button" type="submit">Submit</button>
    </form>
    } @else {
    <div>Thanks for signing up!</div>
    }
  `,
})
export default class NewsletterComponent {
  signedUp = signal(false);

  onSuccess(result: unknown) {
    const formResult = result as Awaited<ReturnType<typeof action>>;

    if (formResult.type === 'success') {
      this.signedUp.set(true);
    }
  }

  onError(result: unknown) {
    console.log({ result });
  }
}
