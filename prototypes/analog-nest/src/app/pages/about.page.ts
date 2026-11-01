import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad } from '@analogjs/router';

import type { load } from './about.server';

/** Uses only Analog, so it renders on any host. */
@Component({
  selector: 'app-about',
  template: `<p id="about">{{ data().about }}</p>`,
})
export default class About {
  protected readonly data = toSignal(injectLoad<typeof load>(), {
    requireSync: true,
  });
}
