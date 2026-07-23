import { Component } from '@angular/core';

import { GreetingFn } from '../blocks/greeting-fn.component';

// Streaming path (default — no `streaming: false` rule). Confirmatory case: the
// streaming tail reuses the same `whenStable`, so if the buffered route seeds
// correctly, the streamed tail must carry the same seed and hydrate with no
// refetch.
@Component({
  selector: 'fn-streaming-page',
  standalone: true,
  imports: [GreetingFn],
  template: `
    <h1 class="fn-streaming-heading">
      serverFn in &#64;defer(hydrate) — streaming
    </h1>
    @defer (hydrate on immediate) {
      <app-greeting-fn />
    } @placeholder {
      <p class="ph-fn">Loading…</p>
    }
  `,
})
export default class FnStreamingPage {}
