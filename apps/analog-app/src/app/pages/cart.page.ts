import { CurrencyPipe, NgForOf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLinkWithHref } from '@angular/router';

import { CartService } from '../cart.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [RouterLinkWithHref, NgForOf, CurrencyPipe, ReactiveFormsModule],
  template: `
    <h3>Cart</h3>

    <p>
      <a routerLink="/shipping">Shipping Prices</a>
    </p>

    <div class="cart-item" *ngFor="let item of items">
      <span>{{ item.name }} </span>
      <span>{{ item.price | currency }}</span>
    </div>

    <form [formGroup]="checkoutForm" (ngSubmit)="onSubmit()">
      <div>
        <label for="name"> Name </label>
        <input id="name" type="text" formControlName="name" />
      </div>

      <div>
        <label for="address"> Address </label>
        <input id="address" type="text" formControlName="address" />
      </div>

      <button class="button" type="submit">Purchase</button>
    </form>
  `,
})
export default class CartComponent {
  private cartService = inject(CartService);
  private formBuilder = inject(FormBuilder);

  items = this.cartService.getItems();

  checkoutForm = this.formBuilder.group({
    name: '',
    address: '',
  });

  onSubmit(): void {
    // Process checkout data here
    this.items = this.cartService.clearCart();
    console.warn('Your order has been submitted', this.checkoutForm.value);
    this.checkoutForm.reset();
  }
}
