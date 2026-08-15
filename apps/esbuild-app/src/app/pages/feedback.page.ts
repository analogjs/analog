import { Component, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormAction, injectLoad } from '@analogjs/router';

import type { load } from './feedback.server';

@Component({
  imports: [FormAction],
  template: `
    <h1>Feedback</h1>
    <p data-load>{{ data()?.loaded }}</p>
    <form
      method="post"
      (onSuccess)="saved.set($any($event).saved)"
      (onError)="errorText.set($any($event).comment)"
    >
      <input type="text" name="comment" />
      <button type="submit">Send</button>
    </form>
    @if (saved()) {
      <p data-saved>{{ saved() }}</p>
    }
    @if (errorText()) {
      <p data-errors>{{ errorText() }}</p>
    }
  `,
})
export default class FeedbackPageComponent {
  readonly data = toSignal(injectLoad<typeof load>());
  readonly saved = signal('');
  readonly errorText = signal('');
}
