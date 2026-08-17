import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { builtBy } from 'virtual:build-info';

@Component({
  imports: [RouterLink],
  template: `
    <h1>Home</h1>
    <a routerLink="/products/1">Product 1</a>
    <a routerLink="/about">About</a>
    <p data-built-by>{{ builtBy }}</p>
  `,
})
export default class HomePageComponent {
  protected readonly builtBy = builtBy;
}
