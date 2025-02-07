import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { CartService } from '../../cart.service';

@Component({
  selector: 'app-shipping',
  imports: [CurrencyPipe, AsyncPipe],
  template: `
    <h3>Shipping Prices</h3>
    @for (shipping of shippingCosts | async; track $index) {
    <div class="shipping-item">
      <span>{{ shipping.type }}</span>
      <span>{{ shipping.price | currency }}</span>
    </div>
    }
  `,
  styles: `
  h3 {
  border: solid 1px darkblue;
  }
  `,
})
export default class ShippingComponent {
  private readonly cartService = inject(CartService);

  shippingCosts = this.cartService.getShippingPrices();
}
