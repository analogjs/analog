import { injectParams } from '@analogjs/router';
import { CurrencyPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { CartService } from '../cart.service';
import type { Product } from '../products';

@Component({
  selector: 'analogjs-product-details',
  imports: [CurrencyPipe],
  template: `
    <h2>Product Details</h2>

    @if (product(); as product) {
      <div>
        <h3>{{ product.name }}</h3>
        <h4>{{ product.price | currency }}</h4>
        <p>{{ product.description }}</p>
        <button type="button" (click)="addToCart(product)">Buy</button>
      </div>
    }
  `,
})
export default class ProductDetailsComponent {
  private readonly params = injectParams('/products/[productId]');
  private readonly cartService = inject(CartService);
  private readonly http = inject(HttpClient);

  private readonly products = toSignal(
    this.http.get<Product[]>('/api/v1/products').pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  readonly product = computed(() =>
    this.products().find(
      (product) => product.id === Number(this.params().productId),
    ),
  );

  addToCart(product: Product) {
    this.cartService.addToCart(product);
    window.alert('Your product has been added to the cart!');
  }
}
