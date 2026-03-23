import { Component, input, output } from '@angular/core';
import type { Product } from '../products';

@Component({
  selector: 'analogjs-product-alerts',
  template: `
    @if (product() && product()!.price > 700) {
      <p>
        <button
          type="button"
          class="btn btn-secondary btn-outline btn-sm"
          (click)="notify.emit()"
        >
          Notify Me
        </button>
      </p>
    }
  `,
})
export class ProductAlertsComponent {
  readonly product = input.required<Product>();
  notify = output();
}
