import { JsonPipe } from '@angular/common';
import { Component, signal } from '@angular/core';

import { injectServerFn, injectServerFnMutation } from '@analogjs/router';
import { getProduct, getProducts } from '../server-fns/products.server';

/**
 * End-to-end demo of the Server Functions prototype (issue #2422).
 * - GET (input-less read) via the reactive `injectServerFn(fn, args)` form.
 * - POST (input) via the bound-callable `injectServerFn(fn)` form.
 */
@Component({
  selector: 'app-server-functions',
  standalone: true,
  imports: [JsonPipe],
  template: `
    <h2>Server Functions demo</h2>

    <section>
      <h3>GET — getProducts (reactive resource)</h3>
      @if (products.value(); as list) {
        <ul>
          @for (p of list; track p.id) {
            <li>{{ p.name }} — {{ p.price }}</li>
          }
        </ul>
      } @else {
        <p>loading…</p>
      }
    </section>

    <section>
      <h3>POST — getProduct (bound callable)</h3>
      <input
        [value]="productId()"
        (input)="productId.set($any($event.target).value)"
      />
      <button (click)="load()">Load</button>
      @if (selected(); as product) {
        <pre>{{ product | json }}</pre>
      }
    </section>
  `,
})
export default class ServerFunctionsPage {
  // GET: input-less reactive read, hydrated from TransferState on first paint.
  protected readonly products = injectServerFn(getProducts);

  // POST: imperative binding for the on-demand lookup.
  private readonly callGetProduct = injectServerFnMutation(getProduct);

  protected readonly productId = signal('p1');
  protected readonly selected = signal<unknown>(null);

  protected async load(): Promise<void> {
    this.selected.set(await this.callGetProduct({ id: this.productId() }));
  }
}
