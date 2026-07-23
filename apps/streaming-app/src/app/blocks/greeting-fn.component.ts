import { Component } from '@angular/core';
import { injectServerFn } from '@analogjs/router';

import { getGreeting } from '../server-fns/greeting.server';

// Lives inside a `@defer (hydrate on ...)` block, so this component only
// instantiates once the block resolves on the server. It reads a server
// function as a `resource()`; the open question is whether SSR `whenStable`
// awaits that late-instantiated resource so its value is seeded into
// TransferState (and hydrates on the client with no refetch).
@Component({
  selector: 'app-greeting-fn',
  standalone: true,
  template: `<aside class="block-fn" data-testid="greeting-fn">
    @if (greeting.value(); as g) {
      <span class="fn-message">{{ g.message }}</span>
      <span class="fn-token" data-testid="fn-token">{{ g.token }}</span>
    } @else {
      <span class="fn-loading" data-testid="fn-loading">loading…</span>
    }
  </aside>`,
})
export class GreetingFn {
  protected readonly greeting = injectServerFn(getGreeting);
}
