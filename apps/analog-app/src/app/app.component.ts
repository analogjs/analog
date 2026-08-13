import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopBarComponent } from '@analogjs/top-bar';

@Component({
  selector: 'analogjs-root',
  standalone: true,
  imports: [TopBarComponent, RouterOutlet],
  template: `
    <analogjs-top-bar />
    <div class="container">
      <router-outlet />
    </div>
  `,
})
export class AppComponent {}
