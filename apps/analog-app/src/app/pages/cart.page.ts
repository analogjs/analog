import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLinkWithHref } from '@angular/router';

import { CartService } from '../cart.service';

@Component({
  selector: 'analogjs-cart',
  imports: [RouterLinkWithHref, CurrencyPipe, ReactiveFormsModule],
  template: `
    <section class="cart-shell">
      <div class="cart-header">
        <div>
          <p class="eyebrow">Checkout</p>
          <h3>Cart</h3>
        </div>
        <a routerLink="/shipping">Shipping Prices</a>
      </div>

      <div class="cart-layout">
        <section class="cart-panel">
          <h4>Your Items</h4>

          @if (items.length) {
            @for (item of items; track $index) {
              <div class="cart-item">
                <span>{{ item.name }} </span>
                <span>{{ item.price | currency }}</span>
              </div>
            }
          } @else {
            <p>Your cart is empty. Add a product to continue.</p>
          }
        </section>

        <section class="cart-panel">
          <h4>Checkout Details</h4>

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
        </section>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .cart-shell,
      .cart-panel {
        display: grid;
        gap: 1rem;
      }

      .cart-header,
      .cart-layout {
        display: grid;
        gap: 1rem;
      }

      .cart-layout {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }

      .cart-panel {
        padding: 1.3rem;
        border: 1px solid #d9e2ec;
        border-radius: 24px;
        background: #fff;
        box-shadow: 0 18px 44px rgb(15 23 42 / 0.08);
      }

      .eyebrow {
        margin: 0;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #2563eb;
      }

      h3,
      h4,
      p {
        margin: 0;
      }

      form {
        display: grid;
        gap: 0.5rem;
      }
    `,
  ],
})
export default class CartComponent {
  private readonly cartService = inject(CartService);
  private readonly formBuilder = inject(FormBuilder);

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
