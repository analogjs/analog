import { AsyncPipe, CurrencyPipe, NgForOf } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';

import { Observable } from 'rxjs';
import { CartService } from '../../cart.service';

@Component({
  selector: 'app-shipping',
  standalone: true,
  imports: [NgForOf, CurrencyPipe, AsyncPipe],
  templateUrl: './shipping.html',
  styleUrls: ['./shipping.scss'],
})
export default class ShippingComponent implements OnInit {
  private cartService = inject(CartService);

  shippingCosts!: Observable<{ type: string; price: number }[]>;

  ngOnInit(): void {
    this.shippingCosts = this.cartService.getShippingPrices();
  }
}
