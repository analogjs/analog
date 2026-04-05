import { Component } from '@angular/core';
import { CounterComponent } from './counter.component';
import { withIncrementalHydration } from '@angular/platform-browser';

@Component({
  selector: 'astro-incremental-hydration-test',
  imports: [CounterComponent],
  template: `
    @defer (hydrate on interaction) {
      <astro-counter />
    }
  `,
})
export class IncrementalHydrationTestComponent {
  static readonly hydrationFeatures = () => [withIncrementalHydration()];
}
