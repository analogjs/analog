import { Component, signal } from '@angular/core';
import { FormAction } from '@analogjs/router';

import {
  type LegacyActionError,
  type LegacyActionSuccess,
} from './legacy-action.server';

@Component({
  selector: 'analogjs-legacy-action-page',
  standalone: true,
  imports: [FormAction],
  template: `
    <h3>Legacy Server Action</h3>

    @if (submittedEmail()) {
      <div id="legacy-action-success">
        Legacy action submitted for {{ submittedEmail() }}.
      </div>
    } @else {
      <form
        method="post"
        (onSuccess)="handleSuccess($any($event))"
        (onError)="handleError($any($event))"
      >
        <div>
          <label for="email"> Email </label>
          <input id="email" type="email" name="email" />
        </div>

        <button class="button" type="submit">Submit</button>
      </form>

      @if (errors()?.email) {
        <p id="legacy-action-error">{{ errors()?.email }}</p>
      }
    }
  `,
})
export default class LegacyActionComponent {
  readonly submittedEmail = signal('');
  readonly errors = signal<LegacyActionError | undefined>(undefined);

  handleSuccess(result: LegacyActionSuccess) {
    this.errors.set(undefined);
    this.submittedEmail.set(result.email);
  }

  handleError(result?: LegacyActionError) {
    this.errors.set(result);
  }
}
