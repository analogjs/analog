import { Component } from '@angular/core';
import type { RouteMeta } from '@analogjs/router';

// Rendered through the streaming renderer (implies per-request).
export const routeMeta: RouteMeta = {
  streaming: true,
};

@Component({
  template: `
    <h1>Stream Demo</h1>
    @defer (hydrate on idle) {
      <p data-stream-a>alpha-block</p>
    } @placeholder {
      <p>loading alpha</p>
    }
    @defer (hydrate on idle) {
      <p data-stream-b>beta-block</p>
    } @placeholder {
      <p>loading beta</p>
    }
  `,
})
export default class StreamDemoPageComponent {}
