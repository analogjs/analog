import { Component } from '@angular/core';

import { GreetingFn } from '../blocks/greeting-fn.component';

// Buffered path (this route opts out of streaming via a `streaming: false`
// route rule in vite.config.ts). A serverFn-backed resource inside a
// `@defer (hydrate on immediate)` block — the adversarial case: the block only
// instantiates the component server-side, so its serverFn read must still be
// awaited by `whenStable` and seeded into TransferState.
@Component({
  selector: 'fn-buffered-page',
  standalone: true,
  imports: [GreetingFn],
  template: `
    <h1 class="fn-buffered-heading">
      serverFn in &#64;defer(hydrate) — buffered
    </h1>
    @defer (hydrate on immediate) {
      <app-greeting-fn />
    } @placeholder {
      <p class="ph-fn">Loading…</p>
    }
  `,
})
export default class FnBufferedPage {}
