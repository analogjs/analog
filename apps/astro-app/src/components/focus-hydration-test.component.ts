import { afterNextRender, Component, input, signal } from '@angular/core';

@Component({
  selector: 'astro-hydration-test',
  template: `
    @if (showInput()) {
      <input value="Focus me to hydrate" />
    }

    <small>hydrated: {{ hydrated() }}</small>
  `,
})
export class FocusHydrationTestComponent {
  readonly showInput = input<boolean>(false);
  readonly hydrated = signal(false);

  constructor() {
    // afterNextRender only runs on the client.
    afterNextRender(() => {
      this.hydrated.set(true);
    });
  }
}
