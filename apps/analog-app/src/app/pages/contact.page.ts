import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { FormAction } from '@analogjs/router';

import type {
  ContactActionError,
  ContactActionSuccess,
} from './contact.server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isContactActionSuccess(value: unknown): value is ContactActionSuccess {
  return (
    isRecord(value) &&
    value['received'] === true &&
    typeof value['name'] === 'string' &&
    typeof value['email'] === 'string'
  );
}

function isContactActionError(value: unknown): value is ContactActionError {
  return (
    Array.isArray(value) &&
    value.every(
      (issue) =>
        isRecord(issue) &&
        typeof issue['message'] === 'string' &&
        (typeof issue['path'] === 'undefined' || Array.isArray(issue['path'])),
    )
  );
}

@Component({
  selector: 'analogjs-contact-page',
  standalone: true,
  imports: [FormAction],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Contact Form</h3>

    @if (submitted()) {
      <div id="contact-success">
        Thanks, {{ contactName() }}! We received your message.
      </div>
    } @else {
      <form
        method="post"
        (onSuccess)="handleSuccess($event)"
        (onError)="handleError($event)"
      >
        <div>
          <label for="name">Name</label>
          <input type="text" name="name" id="name" />
        </div>
        <div>
          <label for="email">Email</label>
          <input type="email" name="email" id="email" />
        </div>
        <button class="button" type="submit">Send</button>
      </form>

      @if (hasErrors()) {
        <div id="contact-errors">
          @for (err of errorMessages(); track err) {
            <p>{{ err }}</p>
          }
        </div>
      }
    }
  `,
})
export default class ContactComponent {
  readonly submitted = signal(false);
  readonly contactName = signal('');
  readonly errors = signal<ContactActionError>([]);
  readonly errorMessages = computed(() =>
    this.errors().map((issue) => issue.message),
  );
  readonly hasErrors = computed(() => this.errorMessages().length > 0);

  handleSuccess(result: unknown) {
    if (!isContactActionSuccess(result)) {
      return;
    }

    this.errors.set([]);
    this.contactName.set(result.name);
    this.submitted.set(true);
  }

  handleError(result: unknown) {
    this.errors.set(isContactActionError(result) ? result : []);
  }
}
