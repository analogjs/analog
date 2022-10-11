import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgIf } from '@angular/common';

import { Product, products } from '../products';
import { CartService } from '../cart.service';

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [NgIf],
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
  product: Product | undefined;

  constructor(
    private route: ActivatedRoute,
    private cartService: CartService
  ) {}

  ngOnInit() {
    // First get the product id from the current route.
    const routeParams = this.route.parent!.snapshot!.paramMap;
    const productIdFromRoute = Number(routeParams.get('productId'));

    // Find the product that correspond with the id provided in route.
    this.product = products.find(
      (product) => product.id === productIdFromRoute
    );
  }

  addToCart(product: Product) {
    this.cartService.addToCart(product);
    window.alert('Your product has been added to the cart!');
  }
}
