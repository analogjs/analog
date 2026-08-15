import { Component } from '@angular/core';
import { injectServerFn } from '@analogjs/router';

import { getGreeting } from '../lib/greeting.server';

@Component({
  template: `
    <h1>Fn Demo</h1>
    <p data-fn>{{ greeting.value()?.greeting }}</p>
  `,
})
export default class FnDemoPageComponent {
  readonly greeting = injectServerFn(getGreeting);
}
