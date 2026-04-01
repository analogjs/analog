import { Component, input } from '@angular/core';

@Component({
  selector: 'astro-hydration-test',
  template: `
    @if (showInput()) {
      <input />
    }
  `,
})
export class HydrationTestComponent {
  readonly showInput = input<boolean>(false);
}
