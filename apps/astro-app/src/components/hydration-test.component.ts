import { Component, input } from '@angular/core';
import { DeferredComponent } from './deferred.component';
import { withIncrementalHydration } from '@angular/platform-browser';

@Component({
  selector: 'astro-hydration-test',
  imports: [DeferredComponent],
  template: `
    @if (showInput()) {
      <input />
    }

    @defer (on timer(1s)) {
      <astro-deferred />
    } @placeholder {
      <p>Loading deferred component...</p>
    }
  `,
})
export class HydrationTestComponent {
  static hydrationFeatures = () => [withIncrementalHydration()];

  readonly showInput = input<boolean>(false);
}
