import { NgIf } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Product } from '../products';

@Component({
  selector: 'app-product-alerts',
  standalone: true,
  imports: [NgIf],
  template: `
    <p *ngIf="product && product.price > 700">
      <button type="button" (click)="notify.emit()">Notify Me</button>
    </p>
  `,
})
export class ProductAlertsComponent {
  @Input() product: Product | undefined;
  @Output() notify = new EventEmitter();
}
