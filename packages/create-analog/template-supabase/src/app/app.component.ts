import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { SupabaseAuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    @if (authService.loggedIn()) {
    <div>Logged In</div>
    <button (click)="logout()">Logout</button>
  } @else {
    <a routerLink="/login">Login</a>
  }
  | <a routerLink="/protected">Protected</a>
  <router-outlet />`,
  styles: `
    :host {
      max-width: 1280px;
      margin: 0 auto;
      padding: 2rem;
      text-align: center;
    }
  `,
})
export class AppComponent {
  authService = inject(SupabaseAuthService);

  logout() {
    this.authService.logout();
  }
}
