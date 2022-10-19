import { Component } from '@angular/core';
import { RouterLinkWithHref } from '@angular/router';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [RouterLinkWithHref],
  template: `
    <a routerLink="/">
      <h1>My Store</h1>
    </a>

    <a routerLink="/cart" class="button fancy-button">
      <i class="material-icons">shopping_cart</i>Checkout
    </a>
  `,
})
export class TopBarComponent {}
