import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  template: `
    <h1>Home</h1>
    <a routerLink="/products/1">Product 1</a>
    <a routerLink="/about">About</a>
  `,
})
export default class HomePageComponent {}
