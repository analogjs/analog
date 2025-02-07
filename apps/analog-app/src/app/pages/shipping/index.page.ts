import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { CartService } from '../../cart.service';

@Component({
  selector: 'app-shipping',
  imports: [CurrencyPipe, AsyncPipe],
  templateUrl: './shipping.html',
  styleUrls: ['./shipping.scss'],
})
export default class ShippingComponent {
  private readonly cartService = inject(CartService);

  shippingCosts = this.cartService.getShippingPrices();
}
