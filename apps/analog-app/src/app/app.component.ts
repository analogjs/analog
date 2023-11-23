import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopBarComponent } from '@analogjs/top-bar';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'analogjs-root',
  standalone: true,
  imports: [TopBarComponent, RouterOutlet],
  template: `
    <analogjs-top-bar />

    <div class="container">
      <router-outlet></router-outlet>
    </div>
  `,
})
export class AppComponent {
  http = inject(HttpClient);

  ngOnInit() {
    this.http.get('/api/v1/products').subscribe();
  }
}
