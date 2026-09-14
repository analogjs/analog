import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  getLoadResolver,
  injectLoadData,
  type RouteMeta,
} from '@analogjs/router';
import { RouterLink } from '@angular/router';

import type { load } from './greet.[name].server';

export const routeMeta: RouteMeta = {
  resolve: {
    greetingCopy: (route) => getLoadResolver(route),
  },
};

@Component({
  selector: 'analogjs-greet-page',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3 id="greeting" [attr.data-hydrated]="hydrated()">{{ greeting() }}</h3>
    <p id="greet-name">{{ name() }}</p>
    <p id="greet-shout">{{ shout() }}</p>
    <a [routerLink]="[]" [queryParams]="{ shout: 'true' }">Shout greeting</a>
    <a [routerLink]="[]" [queryParams]="{ shout: 'false' }">Normal greeting</a>
  `,
})
export default class GreetComponent {
  readonly hydrated = signal(false);

  constructor() {
    afterNextRender(() => this.hydrated.set(true));
  }

  private readonly data = toSignal(injectLoadData<typeof load>(), {
    requireSync: true,
  });

  readonly greeting = computed(() => this.data().greeting);
  readonly name = computed(() => this.data().name);
  readonly shout = computed(() => String(this.data().shout));
}
