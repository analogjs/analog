import { injectActivatedRoute } from '@analogjs/router';
import { CurrencyPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { catchError, of } from 'rxjs';

import { CartService } from '../cart.service';
import { Product } from '../products';

@Component({
  selector: 'app-product-details',
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
export default class ProductDetailsComponent implements OnInit {
  private readonly route = injectActivatedRoute();
  private readonly cartService = inject(CartService);
  private readonly http = inject(HttpClient);

  product = signal<Product | undefined>(undefined);

  ngOnInit() {
    // First get the product id from the current route.
    const routeParams = this.route.parent!.snapshot!.paramMap;
    const productIdFromRoute = Number(routeParams.get('productId'));

    this.http
      .get<Product[]>('/api/v1/products')
      .pipe(catchError(() => of([])))
      .subscribe((products) => {
        // Find the product that correspond with the id provided in route.
        const product = products.find(
          (product) => product.id === productIdFromRoute,
        );

        this.product.set(product);
      });
  }

  addToCart(product: Product) {
    this.cartService.addToCart(product);
    window.alert('Your product has been added to the cart!');
  }
}
