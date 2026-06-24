import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer, Header } from '@analogjs/docs/ui';

@Component({
  selector: 'docs-root',
  imports: [RouterOutlet, Header, Footer],
  template: `
    <docs-header />
    <main class="min-h-screen">
      <router-outlet />
    </main>
    <docs-footer />
  `,
})
export class AppComponent {}
