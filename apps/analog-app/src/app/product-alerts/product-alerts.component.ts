import { Component, input, output } from '@angular/core';
import { Product } from '../products';

@Component({
  selector: 'app-product-alerts',
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
