import { Component, input, output } from '@angular/core';
import type { Product } from '../products';

@Component({
  selector: 'analogjs-product-alerts',
  template: `
    @if (product() && product()!.price > 700) {
      <p>
        <button type="button" (click)="notify.emit()">Notify Me</button>
      </p>
    }
  `,
})
export class ProductAlertsComponent {
  readonly product = input.required<Product>();
  notify = output();
}
