import { Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad } from '@analogjs/router';

import type { load } from './greet.[name].server';

@Component({
  selector: 'analogjs-greet-page',
  standalone: true,
  template: `
    <h3 id="greeting">{{ greeting() }}</h3>
    <p id="greet-name">{{ name() }}</p>
    <p id="greet-shout">{{ shout() }}</p>
  `,
})
export default class GreetComponent {
  private readonly loadResult = toSignal(injectLoad<typeof load>(), {
    requireSync: true,
  });

  private readonly data = computed(() => {
    const result = this.loadResult();

    if (result instanceof Response) {
      throw new Error('Expected page load data but received a response.');
    }

    return result;
  });

  greeting = computed(() => this.data().greeting);
  name = computed(() => this.data().name);
  shout = computed(() => String(this.data().shout));
}
