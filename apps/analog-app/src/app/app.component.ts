import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { TopBarComponent } from './top-bar/top-bar.component';

@Component({
  selector: 'analogjs-root',
  standalone: true,
  imports: [TopBarComponent, RouterOutlet],
  template: `
    <app-top-bar></app-top-bar>

    <div class="container">
      <router-outlet></router-outlet>
    </div>
  `,
})
export class AppComponent {}
