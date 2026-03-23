import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { ShippingService } from './shipping-service';

@Component({
  selector: 'analogjs-shipping',
  imports: [CurrencyPipe, AsyncPipe],
  templateUrl: './shipping.html',
})
export default class ShippingComponent {
  private readonly shippingService = inject(ShippingService);

  shippingCosts = this.shippingService.getShippingPrices();
}
