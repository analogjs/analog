import type { RouteMeta } from '@analogjs/router';
import { injectLoad, routePath } from '@analogjs/router';
import { Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { ProductAlertsComponent } from '../product-alerts/product-alerts.component';
import type { load } from './(home).server';

export const routeMeta: RouteMeta = {
  title: 'Product List',
};

@Component({
  selector: 'analogjs-product-list',
  imports: [ProductAlertsComponent, RouterLink],
  template: `
    <h2>Products</h2>

    @for (product of products(); track product.id) {
      <div>
        <h3>
          <a
            [title]="product.name + ' details'"
            [routerLink]="product.link.path"
          >
            {{ product.name }}
          </a>
        </h3>
        @if (product.description) {
          <p>Description: {{ product.description }}</p>
        }
        <button type="button" (click)="share()">Share</button>
        <analogjs-product-alerts [product]="product" (notify)="onNotify()" />
      </div>
    }
  `,
  styles: [
    `
      $neon: lightblue;

      @mixin background($color: #fff) {
        background: $color;
      }

      h2 {
        @include background($neon);
      }
    `,
  ],
})
export default class ProductListComponent {
  private readonly data = toSignal(injectLoad<typeof load>(), {
    requireSync: true,
  });
  readonly products = computed(() =>
    this.data().products.map((product) => ({
      ...product,
      link: routePath('/products/[productId]', {
        params: { productId: product.id.toString() },
      }),
    })),
  );

  share() {
    window.alert('The product has been shared!');
  }

  onNotify() {
    window.alert('You will be notified when the product goes on sale');
  }
}
