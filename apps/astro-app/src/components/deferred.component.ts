import { afterNextRender, Component, signal } from '@angular/core';

@Component({
  selector: 'astro-deferred',
  template: `
    <button style="display:block" (click)="handleClick()">
      Count: {{ count() }} | hydrated: {{ hydrated() }}
    </button>
  `,
})
export class DeferredComponent {
  readonly count = signal(0);
  readonly hydrated = signal(false);

  constructor() {
    // afterNextRender only runs on the client.
    afterNextRender(() => {
      this.hydrated.set(true);
    });
  }

  handleClick(): void {
    this.count.update((count) => count + 1);
  }
}
