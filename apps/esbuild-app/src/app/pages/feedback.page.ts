import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad } from '@analogjs/router';

import type { load } from './feedback.server';

@Component({
  template: `
    <h1>Feedback</h1>
    <p data-load>{{ data()?.loaded }}</p>
  `,
})
export default class FeedbackPageComponent {
  readonly data = toSignal(injectLoad<typeof load>());
}
