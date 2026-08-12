import { Component, linkedSignal } from '@angular/core';
import { httpResource } from '@angular/common/http';

@Component({
  selector: 'app-slow-b',
  standalone: true,
  template: `<aside class="block-b">
    Block B — deferred + incrementally hydrated. label = {{ label() }}
    <button class="btn-b" (click)="toggle()">B!</button>
  </aside>`,
})
export class SlowB {
  // Real per-request data fetch against a slow API route. During SSR the render
  // stays unstable until this resolves, so the authoritative document is the
  // last thing flushed — the head and Block A have already streamed.
  private data = httpResource<{ label: string }>(() => '/api/slow-b');

  // Seed a writable signal from the resolved data; the click can still override
  // it locally, and it re-seeds if the source ever changes.
  label = linkedSignal(() => this.data.value()?.label ?? 'loading');

  toggle() {
    this.label.set(this.label() === 'summer' ? 'winter' : 'summer');
  }
}
