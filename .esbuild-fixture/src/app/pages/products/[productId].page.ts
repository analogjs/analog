import { Component, input } from '@angular/core';

@Component({
  selector: 'app-product',
  template: `<h1>Product {{ productId() }}</h1>`,
})
export default class ProductPage {
  readonly productId = input.required<string>();
}
