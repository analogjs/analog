import { Component } from '@angular/core';
import {
  RouterLinkActive,
  RouterLinkWithHref,
  RouterOutlet,
} from '@angular/router';

@Component({
  selector: 'tq-root',
  standalone: true,
  imports: [RouterLinkActive, RouterLinkWithHref, RouterOutlet],
  template: `
    <div
      class="min-h-screen bg-gradient-to-b from-base-200 via-base-200 to-base-100 text-base-content"
    >
      <header
        class="sticky top-0 z-50 border-b border-base-300/80 bg-base-100/85 shadow-sm backdrop-blur"
      >
        <div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div class="navbar min-h-0 gap-3 px-0 py-3">
            <div class="navbar-start gap-2">
              <a
                routerLink="/"
                class="btn btn-ghost px-2 text-xl font-black normal-case tracking-tight"
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
                class="menu menu-horizontal gap-1 rounded-box border border-base-300 bg-base-100 p-1 text-sm shadow-sm"
              >
                <li>
                  <a
                    routerLink="/"
                    routerLinkActive="active"
                    [routerLinkActiveOptions]="{ exact: true }"
                  >
                    Home
                  </a>
                </li>
                <li>
                  <a routerLink="/tanstack-query" routerLinkActive="active">
                    Basic
                  </a>
                </li>
                <li>
                  <a
                    routerLink="/tanstack-query-multi"
                    routerLinkActive="active"
                  >
                    Multi
                  </a>
                </li>
                <li>
                  <a
                    routerLink="/tanstack-query-infinite"
                    routerLinkActive="active"
                  >
                    Infinite
                  </a>
                </li>
                <li>
                  <a
                    routerLink="/tanstack-query-optimistic"
                    routerLinkActive="active"
                  >
                    Optimistic
                  </a>
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
                  class="menu dropdown-content menu-sm z-10 mt-2 w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl"
                >
                  <li>
                    <a
                      routerLink="/"
                      routerLinkActive="active"
                      [routerLinkActiveOptions]="{ exact: true }"
                    >
                      Home
                    </a>
                  </li>
                  <li>
                    <a routerLink="/tanstack-query" routerLinkActive="active">
                      Basic
                    </a>
                  </li>
                  <li>
                    <a
                      routerLink="/tanstack-query-multi"
                      routerLinkActive="active"
                    >
                      Multi
                    </a>
                  </li>
                  <li>
                    <a
                      routerLink="/tanstack-query-infinite"
                      routerLinkActive="active"
                    >
                      Infinite
                    </a>
                  </li>
                  <li>
                    <a
                      routerLink="/tanstack-query-optimistic"
                      routerLinkActive="active"
                    >
                      Optimistic
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppComponent {}
