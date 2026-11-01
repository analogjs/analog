import { Component, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormAction, injectLoad, injectServerFn } from '@analogjs/router';

import type { load } from './index.server';
import { greet } from '../server-fns/greeting.server';

@Component({
  selector: 'app-home',
  imports: [FormAction],
  template: `
    <h1>Analog on Nest</h1>

    <p id="load">{{ data().message }}</p>

    <label>
      Name
      <input [value]="name()" (input)="name.set($any($event.target).value)" />
    </label>
    <p id="server-fn">
      @if (greeting.value(); as g) {
        {{ g.message }} (Nest instance {{ g.instance }})
      } @else {
        Loading…
      }
    </p>

    <form method="post" (onSuccess)="subscribed.set($any($event).subscribed)">
      <input type="email" name="email" value="a@b.dev" />
      <button>Subscribe</button>
    </form>
    @if (subscribed(); as email) {
      <p id="action">Subscribed {{ email }}</p>
    }
  `,
})
export default class Home {
  protected readonly data = toSignal(injectLoad<typeof load>(), {
    requireSync: true,
  });
  protected readonly name = signal('Analog');
  protected readonly greeting = injectServerFn(greet, () => ({
    name: this.name(),
  }));
  protected readonly subscribed = signal<string | undefined>(undefined);
}
