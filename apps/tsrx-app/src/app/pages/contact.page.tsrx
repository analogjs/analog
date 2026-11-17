import { FormAction, type RouteMeta } from '@analogjs/router';
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
  const onError = (issues: unknown) =>
    errors.set(
      Array.isArray(issues)
        ? issues.map((issue: Issue) => issue.message)
        : ['Something went wrong.'],
    );

  <section>
    <h1>{'Form actions'}</h1>
    @if (sentBy()) {
      <p id="contact-success">{'Thanks, '}{sentBy()}{'! We received your message.'}</p>
    } @else {
      <form method="post" use={[FormAction]} on:onSuccess={onSuccess} on:onError={onError}>
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
