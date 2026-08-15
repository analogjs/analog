import { Component } from '@angular/core';

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
