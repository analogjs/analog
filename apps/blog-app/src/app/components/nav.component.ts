import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav>
      <a routerLink="/blog">Blog</a> | <a routerLink="/archived">Archived</a> |
      <a routerLink="/about">About</a> |
      <a routerLink="/contact">Contact</a>
    </nav>
  `,
})
export default class NavComponent {}
