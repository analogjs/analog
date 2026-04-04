import { Component, signal } from '@angular/core';

@Component({
  selector: 'astro-deferred',
  template: `
    <button style="display:block" (click)="handleClick()">
      Count: {{ count() }}
    </button>
  `,
})
export class DeferredComponent {
  readonly count = signal(0);

  handleClick(): void {
    this.count.update((count) => count + 1);
  }
}
