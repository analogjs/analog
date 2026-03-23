import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLinkWithHref } from '@angular/router';

import { CartService } from '../cart.service';

@Component({
  selector: 'analogjs-cart',
  imports: [RouterLinkWithHref, CurrencyPipe, ReactiveFormsModule],
  template: `
    <section class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div class="card card-border bg-base-100 shadow-xl">
        <div class="card-body gap-5">
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
          >
            <div class="space-y-3">
              <div class="badge badge-primary badge-outline">Cart</div>
              <h1 class="card-title text-3xl">Review your items</h1>
            </div>
            <a routerLink="/shipping" class="btn btn-outline btn-sm"
              >Shipping Prices</a
            >
          </div>

          @if (items.length) {
            <ul class="list bg-base-200 rounded-box">
              @for (item of items; track $index) {
                <li class="list-row">
                  <div class="list-col-grow">
                    <div class="font-semibold">{{ item.name }}</div>
                    <div class="text-sm text-base-content/60">
                      Ready to purchase
                    </div>
                  </div>
                  <div class="badge badge-primary badge-outline">
                    {{ item.price | currency }}
                  </div>
                </li>
              }
            </ul>
          } @else {
            <div role="alert" class="alert alert-info alert-soft">
              <span>Your cart is empty.</span>
            </div>
          }
        </div>
      </div>

      <div class="card card-border bg-base-100 shadow-xl">
        <div class="card-body gap-5">
          <div class="space-y-2">
            <div class="badge badge-secondary badge-outline">Checkout</div>
            <h2 class="card-title text-2xl">Purchase details</h2>
          </div>

          <form
            class="space-y-4"
            [formGroup]="checkoutForm"
            (ngSubmit)="onSubmit()"
          >
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Name</legend>
              <input
                class="input w-full"
                id="name"
                type="text"
                formControlName="name"
              />
            </fieldset>

            <fieldset class="fieldset">
              <legend class="fieldset-legend">Address</legend>
              <input
                class="input w-full"
                id="address"
                type="text"
                formControlName="address"
              />
            </fieldset>

            <div class="card-actions justify-start">
              <button class="btn btn-primary" type="submit">Purchase</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  `,
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
