import { Component } from '@angular/core';
import { DeferredComponent } from './deferred.component';
import { withIncrementalHydration } from '@angular/platform-browser';

@Component({
  selector: 'astro-incremental-hydration-test',
  imports: [DeferredComponent],
  template: `
    @defer (hydrate on interaction) {
      <astro-deferred />
    }
  `,
})
export class IncrementalHydrationTestComponent {
  static readonly hydrationFeatures = () => [withIncrementalHydration()];
}
