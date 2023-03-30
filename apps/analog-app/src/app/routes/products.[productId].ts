import { Component, inject, OnInit } from '@angular/core';
import { CurrencyPipe, NgIf } from '@angular/common';
import { injectActivatedRoute } from '@analogjs/router';

import { Product } from '../products';
import { CartService } from '../cart.service';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [NgIf, CurrencyPipe],
  template: `
    <h2>Product Details</h2>

    <div *ngIf="product">
      <h3>{{ product.name }}</h3>
      <h4>{{ product.price | currency }}</h4>
      <p>{{ product.description }}</p>
      <button type="button" (click)="addToCart(product)">Buy</button>
    </div>
  `,
})
export default class ProductDetailsComponent implements OnInit {
  private route = injectActivatedRoute();
  private cartService = inject(CartService);
  private http = inject(HttpClient);

  product: Product | undefined;

  ngOnInit() {
    // First get the product id from the current route.
    const routeParams = this.route.parent!.snapshot!.paramMap;
    const productIdFromRoute = Number(routeParams.get('productId'));

    this.http
      .get<Product[]>('/api/v1/products')
      .pipe(catchError(() => of([])))
      .subscribe((products) => {
        // Find the product that correspond with the id provided in route.
        this.product = products.find(
          (product) => product.id === productIdFromRoute
        );
      });
  }

  addToCart(product: Product) {
    this.cartService.addToCart(product);
    window.alert('Your product has been added to the cart!');
  }
}
