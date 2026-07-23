import { Component, signal } from '@angular/core';

// Deferred block hydrated by a *non-immediate* trigger (`hydrate on
// interaction`). It renders eagerly on the server like the others, but stays
// dormant on the client until the first interaction — the click both triggers
// hydration and is replayed to the handler. Proves the streaming reconcile
// (the swap to the authoritative body) preserves the dehydrated DOM, jsaction
// markers, and event contract that triggered hydration depends on.
@Component({
  selector: 'app-trigger-c',
  standalone: true,
  template: `<section class="block-c">
    Block C — deferred + hydrated on interaction. count = {{ count() }}
    <button class="btn-c" (click)="inc()">C+</button>
  </section>`,
})
export class TriggerC {
  count = signal(100);
  inc() {
    this.count.set(this.count() + 1);
  }
}
