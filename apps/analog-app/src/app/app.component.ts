import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopBarComponent } from '@analogjs/top-bar';

@Component({
  selector: 'analogjs-root',
  standalone: true,
  imports: [TopBarComponent, RouterOutlet],
  template: `
    <analogjs-top-bar />
    <main class="container">
      <router-outlet />
    </main>
  `,
})
export class AppComponent {}
