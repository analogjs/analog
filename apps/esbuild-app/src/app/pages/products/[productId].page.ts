import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  template: `<h1>Product {{ productId() }}</h1>`,
})
export default class ProductPageComponent {
  private readonly route = inject(ActivatedRoute);
  readonly productId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('productId'))),
  );
}
