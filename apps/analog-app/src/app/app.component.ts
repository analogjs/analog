import { Component } from '@angular/core';
import { RouterLinkWithHref, RouterOutlet } from '@angular/router';

@Component({
  selector: 'analogjs-root',
  standalone: true,
  imports: [RouterLinkWithHref, RouterOutlet],
  template: `
    <div class="min-h-screen bg-base-200 text-base-content">
      <header
        class="sticky top-0 z-50 border-b border-base-300 bg-base-100/85 backdrop-blur"
      >
        <div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div class="navbar min-h-0 px-0 py-3">
            <div class="navbar-start gap-2">
              <a
                routerLink="/"
                class="btn btn-ghost px-2 text-xl font-black normal-case"
              >
                Analog App
              </a>
              <div
                class="badge badge-primary badge-outline hidden sm:inline-flex"
              >
                demo
              </div>
            </div>

            <div class="navbar-center hidden lg:flex">
              <ul
                class="menu menu-horizontal gap-1 rounded-box bg-base-200 p-1 text-sm"
              >
                <li><a routerLink="/">Home</a></li>
                <li><a routerLink="/contact">Contact</a></li>
                <li><a routerLink="/newsletter">Newsletter</a></li>
                <li><a routerLink="/search">Search</a></li>
              </ul>
            </div>

            <div class="navbar-end gap-2">
              <a
                routerLink="/contact"
                class="btn btn-ghost btn-sm hidden md:inline-flex"
              >
                Server actions
              </a>
              <a routerLink="/cart" class="btn btn-primary btn-sm">
                <span class="material-icons text-base">shopping_cart</span>
                Cart
              </a>
            </div>
          </div>
        </div>
      </header>

      <main class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppComponent {}
