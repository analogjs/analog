import { injectActivatedRoute } from '@analogjs/router';
import { CurrencyPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import type { OnInit } from '@angular/core';
import { Component, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';

import { CartService } from '../cart.service';
import type { Product } from '../products';

@Component({
  selector: 'analogjs-product-details',
  imports: [CurrencyPipe],
  template: `
    <section class="card card-border bg-base-100 shadow-xl">
      <div class="card-body gap-6">
        <div class="space-y-3">
          <div class="badge badge-accent badge-outline">Product details</div>
          <h1 class="card-title text-3xl">Product details</h1>
        </div>

        @if (product(); as product) {
          <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div class="space-y-4">
              <h2 class="text-3xl font-bold">{{ product.name }}</h2>
              <p class="text-base leading-7 text-base-content/70">
                {{ product.description }}
              </p>
            </div>

            <div class="card bg-base-200 shadow-sm">
              <div class="card-body gap-4">
                <div class="badge badge-primary badge-lg">
                  {{ product.price | currency }}
                </div>
                <p class="text-sm text-base-content/70">
                  Add this item to the cart to continue through the client-side
                  purchase flow.
                </p>
                <div class="card-actions justify-start">
                  <button
                    type="button"
                    class="btn btn-primary"
                    (click)="addToCart(product)"
                  >
                    Buy
                  </button>
                </div>
              </div>
            </div>
          </div>
        } @else {
          <div role="alert" class="alert alert-warning alert-soft">
            <span>We could not find that product.</span>
          </div>
        }
      </div>
    </section>
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
