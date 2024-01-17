import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import NavComponent from './components/nav.component';

@Component({
  selector: 'blog-root',
  standalone: true,
  imports: [RouterOutlet, NavComponent],
  template: `
    <app-nav></app-nav>
    <router-outlet></router-outlet>
  `,
})
export class AppComponent {}
