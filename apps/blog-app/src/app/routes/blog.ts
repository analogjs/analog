import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'blog',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <a routerLink="/blog/2022-12-27-my-first-post">My First Post</a>
    | <a routerLink="/blog/2022-12-31-my-second-post">My Second Post</a> |
    <a routerLink="/about">About</a>

    <router-outlet></router-outlet>
  `,
})
export default class BlogComponent {}
