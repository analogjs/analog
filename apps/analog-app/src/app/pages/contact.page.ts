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
    <section class="card card-border bg-base-100 shadow-xl">
      <div class="card-body gap-6">
        <div class="space-y-3">
          <div class="badge badge-success badge-outline">Server Action</div>
          <h1 class="card-title text-3xl">Contact form</h1>
          <p class="max-w-2xl text-base-content/70">
            Submit a progressively enhanced form powered by Analog server
            actions.
          </p>
        </div>

        @if (submitted()) {
          <div
            id="contact-success"
            role="alert"
            class="alert alert-success alert-soft"
          >
            <span>Thanks, {{ contactName() }}! We received your message.</span>
          </div>
        } @else {
          <form
            class="space-y-4"
            method="post"
            (onSuccess)="handleSuccess($event)"
            (onError)="handleError($event)"
          >
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Name</legend>
              <input
                class="input w-full md:max-w-lg"
                type="text"
                name="name"
                id="name"
              />
            </fieldset>

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
              <button class="btn btn-primary" type="submit">Send</button>
            </div>
          </form>

          @if (hasErrors()) {
            <div
              id="contact-errors"
              role="alert"
              class="alert alert-error alert-soft"
            >
              <div class="space-y-1">
                @for (err of errorMessages(); track err) {
                  <p>{{ err }}</p>
                }
              </div>
            </div>
          }
        }
      </div>
    </section>
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
