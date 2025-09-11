import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { ShippingService } from './shipping-service';

@Component({
  selector: 'app-shipping',
  imports: [CurrencyPipe, AsyncPipe],
  templateUrl: './shipping.html',
  styleUrls: ['./shipping.scss'],
})
export default class ShippingComponent {
  private readonly shippingService = inject(ShippingService);

  shippingCosts = this.shippingService.getShippingPrices();
}
