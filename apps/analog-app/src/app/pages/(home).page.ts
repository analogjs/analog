import type { RouteMeta } from '@analogjs/router';
import { injectLoad } from '@analogjs/router';
import { CurrencyPipe } from '@angular/common';
import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLinkWithHref } from '@angular/router';

import { ProductAlertsComponent } from '../product-alerts/product-alerts.component';
import type { load } from './(home).server';

export const routeMeta: RouteMeta = {
  title: 'Analog Store Demo',
};

@Component({
  selector: 'analogjs-product-list',
  imports: [CurrencyPipe, ProductAlertsComponent, RouterLinkWithHref],
  template: `
    <div class="flex flex-col gap-8">
      <section
        class="hero card card-border overflow-hidden bg-base-100 shadow-xl"
      >
        <div
          class="hero-content flex-col items-stretch gap-8 px-6 py-8 lg:flex-row lg:px-10 lg:py-12"
        >
          <div class="flex-1 space-y-5">
            <div class="badge badge-primary badge-outline badge-lg">
              AnalogJS Demo App
            </div>
            <div class="space-y-4">
              <h1
                class="max-w-3xl text-4xl font-black leading-tight sm:text-5xl"
              >
                Explore router features, server actions, and TanStack Query
                flows.
              </h1>
              <p class="max-w-2xl text-base-content/70 sm:text-lg">
                This sample app now uses daisyUI as the primary presentation
                layer, turning the starter experience into a cleaner landing
                page for the key AnalogJS demos.
              </p>
            </div>

            <div class="flex flex-wrap gap-3">
              <a
                routerLink="/tanstack-query"
                class="btn btn-primary btn-lg shadow-lg"
              >
                Open query demos
              </a>
              <a
                routerLink="/contact"
                class="btn btn-secondary btn-soft btn-lg"
              >
                Try a server action
              </a>
            </div>

            <div class="flex flex-wrap gap-2">
              <div class="badge badge-neutral badge-soft gap-2 px-3 py-3">
                <span class="status status-primary status-sm"></span>
                SSR-ready demos
              </div>
              <div class="badge badge-neutral badge-soft gap-2 px-3 py-3">
                <span class="status status-success status-sm"></span>
                Typed routes
              </div>
              <div class="badge badge-neutral badge-soft gap-2 px-3 py-3">
                <span class="status status-warning status-sm"></span>
                Server actions
              </div>
            </div>
          </div>

          <div class="w-full lg:max-w-md">
            <div class="card bg-base-200 shadow-lg">
              <div class="card-body gap-5">
                <div class="space-y-3">
                  <div class="badge badge-secondary badge-outline">
                    What is included
                  </div>
                  <div>
                    <h2 class="card-title text-2xl">
                      Built to explore AnalogJS quickly
                    </h2>
                    <p class="mt-2 text-sm leading-6 text-base-content/70">
                      A small storefront shell with focused demos for routing,
                      data, actions, and client-side interactions.
                    </p>
                  </div>
                </div>

                <div class="stats stats-horizontal bg-base-100 shadow-sm">
                  <div class="stat px-4 py-3">
                    <div class="stat-title">Featured flows</div>
                    <div class="stat-value text-2xl">4</div>
                  </div>
                  <div class="stat px-4 py-3">
                    <div class="stat-title">Core areas</div>
                    <div class="stat-value text-2xl">3</div>
                  </div>
                </div>

                <ul class="list rounded-box bg-base-100">
                  <li class="list-row">
                    <span
                      class="status status-info status-md self-center"
                    ></span>
                    <div class="list-col-grow">
                      <div class="font-semibold">SSR route loading</div>
                      <div class="text-sm text-base-content/60">
                        Page data fetched through route-level loaders.
                      </div>
                    </div>
                    <div class="badge badge-info badge-soft">Router</div>
                  </li>
                  <li class="list-row">
                    <span
                      class="status status-primary status-md self-center"
                    ></span>
                    <div class="list-col-grow">
                      <div class="font-semibold">
                        Typed params and query state
                      </div>
                      <div class="text-sm text-base-content/60">
                        Narrow route inputs before rendering or fetching.
                      </div>
                    </div>
                    <div class="badge badge-primary badge-soft">Typed</div>
                  </li>
                  <li class="list-row">
                    <span
                      class="status status-success status-md self-center"
                    ></span>
                    <div class="list-col-grow">
                      <div class="font-semibold">
                        Progressive server actions
                      </div>
                      <div class="text-sm text-base-content/60">
                        Forms that work with server-driven validation and
                        success states.
                      </div>
                    </div>
                    <div class="badge badge-success badge-soft">Actions</div>
                  </li>
                  <li class="list-row">
                    <span
                      class="status status-warning status-md self-center"
                    ></span>
                    <div class="list-col-grow">
                      <div class="font-semibold">Storefront client flows</div>
                      <div class="text-sm text-base-content/60">
                        Product, cart, and shipping examples to anchor the
                        demos.
                      </div>
                    </div>
                    <div class="badge badge-warning badge-soft">UI</div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="card card-border bg-base-100 shadow-xl">
        <div class="card-body gap-6">
          <div
            class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
          >
            <div class="space-y-3">
              <div class="badge badge-secondary badge-outline">
                Feature Demos
              </div>
              <h2 class="text-3xl font-bold">Navigate the examples</h2>
            </div>
            <p class="max-w-2xl text-base-content/70">
              Each card links directly to a focused demo, grouped by the feature
              area it highlights.
            </p>
          </div>

          <div class="grid gap-5 xl:grid-cols-2">
            <div class="card card-border bg-base-200 shadow-sm">
              <div class="card-body">
                <div class="flex items-center justify-between gap-3">
                  <h3 class="card-title">TanStack Query</h3>
                  <div class="badge badge-info badge-outline">
                    Data fetching
                  </div>
                </div>

                <div class="grid gap-3">
                  <a
                    routerLink="/tanstack-query"
                    class="card card-border bg-base-100 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div class="card-body gap-2 p-4">
                      <span class="font-semibold">Query + Mutation</span>
                      <span class="text-sm text-base-content/70">
                        SSR hydration, typed options, and mutation flows
                      </span>
                    </div>
                  </a>
                  <a
                    routerLink="/tanstack-query-multi"
                    class="card card-border bg-base-100 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div class="card-body gap-2 p-4">
                      <span class="font-semibold">Multi &amp; Dependent</span>
                      <span class="text-sm text-base-content/70">
                        Coordinate related queries with conditional loading
                      </span>
                    </div>
                  </a>
                  <a
                    routerLink="/tanstack-query-infinite"
                    class="card card-border bg-base-100 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div class="card-body gap-2 p-4">
                      <span class="font-semibold">Infinite Query</span>
                      <span class="text-sm text-base-content/70">
                        Cursor pagination with a load-more interaction
                      </span>
                    </div>
                  </a>
                  <a
                    routerLink="/tanstack-query-optimistic"
                    class="card card-border bg-base-100 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div class="card-body gap-2 p-4">
                      <span class="font-semibold">Optimistic Updates</span>
                      <span class="text-sm text-base-content/70">
                        Preview changes immediately and roll back on failure
                      </span>
                    </div>
                  </a>
                </div>
              </div>
            </div>

            <div class="card card-border bg-base-200 shadow-sm">
              <div class="card-body">
                <div class="flex items-center justify-between gap-3">
                  <h3 class="card-title">Server Actions</h3>
                  <div class="badge badge-success badge-outline">
                    Form workflows
                  </div>
                </div>

                <div class="grid gap-3">
                  <a
                    routerLink="/contact"
                    class="card card-border bg-base-100 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div class="card-body gap-2 p-4">
                      <span class="font-semibold">Form Action</span>
                      <span class="text-sm text-base-content/70">
                        Validate and submit with defineAction plus Valibot
                      </span>
                    </div>
                  </a>
                  <a
                    routerLink="/greet/analog"
                    class="card card-border bg-base-100 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div class="card-body gap-2 p-4">
                      <span class="font-semibold">Page Load</span>
                      <span class="text-sm text-base-content/70">
                        Use typed params and query values in route data
                      </span>
                    </div>
                  </a>
                  <a
                    routerLink="/greet/analog"
                    [queryParams]="{ shout: 'true' }"
                    class="card card-border bg-base-100 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div class="card-body gap-2 p-4">
                      <span class="font-semibold">Page Load (shout)</span>
                      <span class="text-sm text-base-content/70">
                        See query param transforms shape the rendered result
                      </span>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="card card-border bg-base-100 shadow-xl">
        <div class="card-body gap-6">
          <div
            class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
          >
            <div class="space-y-3">
              <div class="badge badge-accent badge-outline">Catalog</div>
              <h2 class="text-3xl font-bold">Featured products</h2>
            </div>
            <p class="max-w-2xl text-base-content/70">
              The product list is still functional, but now reads like a
              storefront instead of a raw tutorial output.
            </p>
          </div>

          <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            @for (product of data().products; track product.id) {
              <article
                class="card card-border h-full bg-base-100 shadow-md transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div class="card-body h-full gap-5">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="space-y-3">
                      <div class="badge badge-neutral badge-soft">
                        @if (product.price >= 700) {
                          Premium
                        } @else if (product.price >= 500) {
                          Popular
                        } @else {
                          Essential
                        }
                      </div>
                      <h3 class="card-title text-xl">
                        <a
                          class="link link-hover"
                          [title]="product.name + ' details'"
                          [routerLink]="['/products', product.id]"
                        >
                          {{ product.name }}
                        </a>
                      </h3>

                      @if (product.description) {
                        <p class="text-sm leading-6 text-base-content/70">
                          {{ product.description }}
                        </p>
                      }
                    </div>

                    <div class="badge badge-primary badge-outline badge-lg">
                      {{ product.price | currency }}
                    </div>
                  </div>

                  <div class="mt-auto space-y-4">
                    <div class="divider my-0"></div>

                    <div
                      class="card-actions items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        (click)="share(product.name)"
                      >
                        Share
                      </button>
                      <analogjs-product-alerts
                        [product]="product"
                        (notify)="onNotify(product.name)"
                      />
                    </div>
                  </div>
                </div>
              </article>
            }
          </div>
        </div>
      </section>
    </div>
  `,
})
export default class ProductListComponent {
  data = toSignal(injectLoad<typeof load>(), { requireSync: true });

  share(productName: string) {
    window.alert(`${productName} has been shared!`);
  }

  onNotify(productName: string) {
    window.alert(`You will be notified when ${productName} goes on sale`);
  }
}
