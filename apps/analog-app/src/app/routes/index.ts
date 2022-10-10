import { defineRouteMeta } from '@analogjs/router';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ProductAlertsComponent } from '../product-alerts/product-alerts.component';

import { products } from '../products';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, ProductAlertsComponent, RouterModule],
  template: `
    <h2>Products</h2>

    <div *ngFor="let product of products">
      <h3>
        <a
          [title]="product.name + ' details'"
          [routerLink]="['/products', product.id]"
        >
          {{ product.name }}
        </a>
      </h3>

      <p *ngIf="product.description">Description: {{ product.description }}</p>

      <button type="button" (click)="share()">Shares</button>

      <app-product-alerts [product]="product" (notify)="onNotify()">
      </app-product-alerts>
    </div>
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
  products = [...products];

  share() {
    window.alert('The product has been shared!');
  }

  onNotify() {
    window.alert('You will be notified when the product goes on sale');
  }
}

export const routeMeta = defineRouteMeta({
  title: 'Product List',
});
