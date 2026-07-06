import { Component } from '@angular/core';

import { FastA } from '../blocks/fast-a.component';

// This route opts out of streaming via a `streaming: false` route rule (see
// vite.config.ts). It still renders and hydrates like any incremental-hydration
// page, but the response is a single buffered document — no streaming
// scaffolding, no chunked transfer-encoding.
@Component({
  selector: 'buffered-page',
  standalone: true,
  imports: [FastA],
  template: `
    <h1 class="buffered-heading">Buffered route (streaming disabled)</h1>
    @defer (hydrate on immediate) {
      <app-fast-a />
    } @placeholder {
      <p class="ph-a">Loading A…</p>
    }
  `,
})
export default class BufferedPage {}
