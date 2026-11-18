import { FormAction, type FormActionState, type RouteMeta } from '@analogjs/router';
import { signal } from '@angular/core';

import type { ContactResult } from './contact.server';

export const routeMeta: RouteMeta = { title: 'Contact' };

interface Issue {
  message: string;
}

export default function ContactPage() @{
  const sentBy = signal<string | null>(null);
  const errors = signal<string[]>([]);

  const onSuccess = (result: unknown) => {
    errors.set([]);
    sentBy.set((result as ContactResult).name);
  };
  // Whether the server reported validation issues for the current submission.
  let reported = false;
  const onError = (issues: unknown) => {
    reported = true;
    errors.set(
      Array.isArray(issues)
        ? issues.map((issue: Issue) => issue.message)
        : ['Something went wrong.'],
    );
  };
  // A network failure, or a server error without issues, only ends in the
  // `error` state, so it needs its own message. The form stays for a retry.
  const onState = (state: FormActionState) => {
    if (state === 'submitting') {
      reported = false;
    } else if (state === 'error' && !reported) {
      errors.set(['Something went wrong. Please try again.']);
    }
  };

  <section>
    <h1>{'Form actions'}</h1>
    @if (sentBy()) {
      <p id="contact-success">{'Thanks, '}{sentBy()}{'! We received your message.'}</p>
    } @else {
      <form method="post" use={[FormAction]} on:onSuccess={onSuccess} on:onError={onError} on:state={onState}>
        <label>{'Name '}<input id="name" name="name" /></label>
        <label>{'Email '}<input id="email" name="email" type="email" /></label>
        <button id="send" type="submit">{'Send'}</button>
      </form>
    }
    @if (errors().length > 0) {
      <ul id="contact-errors">
        @for (const message of errors(); key message) {
          <li>{message}</li>
        }
      </ul>
    }
  </section>
}
