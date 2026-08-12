import { Component, signal } from '@angular/core';

// Eager, non-@defer component: it renders as part of the app body (so it lands
// in the authoritative tail, not a deferred preview) and — unlike the @defer
// blocks — hydrates immediately on bootstrap rather than via an incremental
// hydration trigger. Covers the ordinary, non-deferred hydration path.
@Component({
  selector: 'app-shell-status',
  standalone: true,
  template: `<p class="block-eager">
    Eager component — rendered in the shell, hydrated immediately. n = {{ n() }}
    <button class="btn-eager" (click)="inc()">E+</button>
  </p>`,
})
export class ShellStatus {
  n = signal(7);
  inc() {
    this.n.set(this.n() + 1);
  }
}
