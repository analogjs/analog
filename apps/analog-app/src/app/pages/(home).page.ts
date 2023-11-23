import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouteMeta, injectLoad } from '@analogjs/router';
import { NgForOf, NgIf } from '@angular/common';
import { RouterLinkWithHref } from '@angular/router';

import { ProductAlertsComponent } from '../product-alerts/product-alerts.component';
import { load } from './(home).server';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { Product } from '../products';

export const routeMeta: RouteMeta = {
  title: 'Product List',
};

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [NgForOf, NgIf, ProductAlertsComponent, RouterLinkWithHref],
  template: `
    <h2>Products</h2>

    <div *ngFor="let product of data()?.products">
      <h3>
        <a
          [title]="product.name + ' details'"
          [routerLink]="['/products', product.id]"
        >
          {{ product.name }}
        </a>
      </h3>

      <p *ngIf="product.description">Description: {{ product.description }}</p>

      <button type="button" (click)="share()">Share</button>

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
  http = inject(HttpClient);
  data = toSignal(
    this.http
      .get<Product[]>('http://localhost:3000/api/v1/products')
      .pipe(map((products) => ({ products })))
  );

  share() {
    window.alert('The product has been shared!');
  }

  onNotify() {
    window.alert('You will be notified when the product goes on sale');
  }
}
