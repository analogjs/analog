import { injectActivatedRoute, injectLoad } from '@analogjs/router';
import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { CartService } from '../cart.service';
import { LiveProductsService } from '../live-products.service';
import type { Product } from '../products';
import type { load } from './products.[productId].server';

export const routeJsonLd = (route: {
  parent?: { paramMap: { get(name: string): string | null } };
}) => {
  const productId = route.parent?.paramMap.get('productId') ?? 'unknown';

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    identifier: `analog-product-${productId}`,
    name: `Analog Product ${productId}`,
    sku: productId,
  };
};

@Component({
  selector: 'analogjs-product-details',
  imports: [CurrencyPipe],
  template: `
    <section class="details-shell">
      <p class="eyebrow">Catalog Details</p>
      <h2>Product Details</h2>

      @if (product(); as product) {
        <article class="details-card">
          <div class="details-header">
            <div>
              <p class="sku">SKU #{{ product.id }}</p>
              <h3>{{ product.name }}</h3>
            </div>
            <p class="price">{{ product.price | currency }}</p>
          </div>

          <p class="description">
            {{
              product.description ||
                'Fresh product copy arrives through the live product service.'
            }}
          </p>

          <div class="details-actions">
            <button type="button" (click)="addToCart(product)">Buy</button>
          </div>
        </article>
      } @else {
        <article class="details-card empty-state">
          <h3>Loading product</h3>
          <p>The live products service is fetching the latest catalog data.</p>
        </article>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .details-shell {
        display: grid;
        gap: 1rem;
      }

      .eyebrow,
      .sku {
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #2563eb;
      }

      .details-card {
        display: grid;
        gap: 1rem;
        padding: 1.4rem;
        border: 1px solid #d9e2ec;
        border-radius: 24px;
        background: linear-gradient(180deg, #fff, #f8fbff);
        box-shadow: 0 20px 48px rgb(15 23 42 / 0.08);
      }

      .details-header {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
      }

      h2,
      h3,
      p {
        margin: 0;
      }

      h3 {
        font-size: 1.75rem;
      }

      .price {
        font-size: 1.35rem;
        font-weight: 700;
        color: #0f172a;
      }

      .description {
        max-width: 60ch;
      }

      @media (max-width: 720px) {
        .details-header {
          flex-direction: column;
        }
      }
    `,
  ],
})
export default class ProductDetailsComponent {
  private readonly route = injectActivatedRoute();
  private readonly cartService = inject(CartService);
  private readonly liveProducts = inject(LiveProductsService);
  private readonly initialData = toSignal(injectLoad<typeof load>(), {
    requireSync: true,
  });
  private readonly productIdFromRoute = Number(
    this.route.parent?.snapshot.paramMap.get('productId'),
  );

  readonly product = computed<Product | undefined>(() =>
    this.liveProducts
      .products()
      .find((product) => product.id === this.productIdFromRoute),
  );

  constructor() {
    // Seed the live products store with the SSR loader snapshot so the
    // product is available immediately during hydration.
    this.liveProducts.connect(this.initialData().products);
  }

  addToCart(product: Product) {
    this.cartService.addToCart(product);
    window.alert('Your product has been added to the cart!');
  }
}
