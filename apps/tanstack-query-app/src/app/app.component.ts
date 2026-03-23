import { Component } from '@angular/core';
import { RouterLinkWithHref, RouterOutlet } from '@angular/router';

@Component({
  selector: 'tq-root',
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
                TanStack Query
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
                <li><a routerLink="/tanstack-query">Basic</a></li>
                <li><a routerLink="/tanstack-query-multi">Multi</a></li>
                <li><a routerLink="/tanstack-query-infinite">Infinite</a></li>
                <li>
                  <a routerLink="/tanstack-query-optimistic">Optimistic</a>
                </li>
              </ul>
            </div>

            <div class="navbar-end">
              <div class="dropdown dropdown-end lg:hidden">
                <div
                  tabindex="0"
                  role="button"
                  class="btn btn-ghost btn-sm px-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </div>
                <ul
                  tabindex="0"
                  class="menu dropdown-content menu-sm z-10 mt-2 w-44 rounded-box bg-base-100 p-2 shadow"
                >
                  <li><a routerLink="/">Home</a></li>
                  <li><a routerLink="/tanstack-query">Basic</a></li>
                  <li><a routerLink="/tanstack-query-multi">Multi</a></li>
                  <li>
                    <a routerLink="/tanstack-query-infinite">Infinite</a>
                  </li>
                  <li>
                    <a routerLink="/tanstack-query-optimistic">Optimistic</a>
                  </li>
                </ul>
              </div>
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
