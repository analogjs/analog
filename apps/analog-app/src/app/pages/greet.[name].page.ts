import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoadData } from '@analogjs/router';

import type { load } from './greet.[name].server';

@Component({
  selector: 'analogjs-greet-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3 id="greeting">{{ greeting() }}</h3>
    <p id="greet-name">{{ name() }}</p>
    <p id="greet-shout">{{ shout() }}</p>
  `,
})
export default class GreetComponent {
  private readonly data = toSignal(injectLoadData<typeof load>(), {
    requireSync: true,
  });

  readonly greeting = computed(() => this.data().greeting);
  readonly name = computed(() => this.data().name);
  readonly shout = computed(() => String(this.data().shout));
}
