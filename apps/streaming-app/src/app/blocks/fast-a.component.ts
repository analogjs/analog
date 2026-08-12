import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-fast-a',
  standalone: true,
  template: `<section class="block-a">
    Block A — deferred (fast, no async) + incrementally hydrated. count =
    {{ count() }}
    <button class="btn-a" (click)="inc()">A+</button>
  </section>`,
})
export class FastA {
  count = signal(41);
  inc() {
    this.count.set(this.count() + 1);
  }
}
