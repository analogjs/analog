import { Component, inject, makeStateKey, TransferState } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { RouteMeta } from '@analogjs/router';
import { injectBaseURL } from '@analogjs/router/tokens';

export const routeMeta: RouteMeta = {
  getPrerenderParams: () => [{ productId: '1' }, { productId: '2' }],
};

const BASE_URL_KEY = makeStateKey<string>('fixtureBaseUrl');

@Component({
  template: `
    <h1>Product {{ productId() }}</h1>
    <p data-base-url>{{ baseUrl }}</p>
  `,
})
export default class ProductPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly transferState = inject(TransferState);
  readonly productId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('productId'))),
  );
  // Populated by provideServerRequestContext on the server and carried
  // to the browser through TransferState so hydration sees equal DOM.
  readonly baseUrl =
    injectBaseURL() ?? this.transferState.get(BASE_URL_KEY, '');

  constructor() {
    if (injectBaseURL()) {
      this.transferState.set(BASE_URL_KEY, this.baseUrl);
    }
  }
}
