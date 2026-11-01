import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad, injectServerFn } from '@analogjs/router';

import type { load } from './about.server';
import { shout } from '../server-fns/shout.server';

/** Uses only Analog, so it renders on any host. */
@Component({
  selector: 'app-about',
  template: `
    <p id="about">{{ data().about }}</p>
    <p id="shout">{{ shouted.value()?.text }}</p>
  `,
})
export default class About {
  protected readonly data = toSignal(injectLoad<typeof load>(), {
    requireSync: true,
  });
  protected readonly shouted = injectServerFn(shout, () => ({
    text: 'analog',
  }));
}
