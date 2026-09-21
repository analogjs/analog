import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
const message = $localize`:@@module:Espanol module`;
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<h1 id="early" i18n="@@early">Espanol early</h1>
    <p id="module">{{ message }}</p>
    <button (click)="count.set(count() + 1)">Clicks: {{ count() }}</button>
    <router-outlet />`,
})
export class App {
  message = message;
  count = signal(0);
}
