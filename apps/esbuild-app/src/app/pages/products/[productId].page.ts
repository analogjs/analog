import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { RouteMeta } from '@analogjs/router';
import { injectBaseURL } from '@analogjs/router/tokens';

export const routeMeta: RouteMeta = {
  getPrerenderParams: () => [{ productId: '1' }, { productId: '2' }],
};

@Component({
  template: `
    <h1>Product {{ productId() }}</h1>
    <p data-base-url>{{ baseUrl }}</p>
  `,
})
export default class ProductPageComponent {
  private readonly route = inject(ActivatedRoute);
  readonly productId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('productId'))),
  );
  // Populated on the server by provideServerRequestContext; null in the browser.
  readonly baseUrl = injectBaseURL();
}
