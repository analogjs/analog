import type { RouteMeta } from '@analogjs/router';
import { injectLoad, routePath } from '@analogjs/router';
import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLinkWithHref } from '@angular/router';

import { LiveServicesService } from '../live-services.service';
import { LiveProductsService } from '../live-products.service';
import { ProductAlertsComponent } from '../product-alerts/product-alerts.component';
import { ProductsSseService } from '../products-sse.service';
import { ServicesSseService } from '../services-sse.service';
import type { load } from './(home).server';

export const routeMeta: RouteMeta = {
  title: 'Product List',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      identifier: 'analog-home',
      name: 'Analog Store',
      url: 'https://analogjs.org/store',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      identifier: 'analog-home-catalog',
      name: 'Analog Store Product List',
    },
  ],
};

@Component({
  selector: 'analogjs-product-list',
  imports: [CurrencyPipe, ProductAlertsComponent, RouterLinkWithHref],
  template: `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Live Catalog Demo</p>
        <h2>Products and services in one live dashboard</h2>
        <p class="hero-text">
          Browse the current catalog, inspect the polling and SSE services, and
          edit the demo data sources to watch SSE land ahead of the next poll.
        </p>
      </div>
      <div class="hero-actions">
        <button type="button" (click)="togglePremiumOnly()">
          {{
            showPremiumOnly() ? 'Show All Products' : 'Show Premium Products'
          }}
        </button>
        <button type="button" (click)="togglePriceSort()">
          {{
            sortByPriceDesc()
              ? 'Default Product Order'
              : 'Sort By Highest Price'
          }}
        </button>
        <button
          type="button"
          (click)="liveProducts.refreshNow()"
          [disabled]="liveProducts.isRefreshing()"
        >
          {{
            liveProducts.isRefreshing() ? 'Refreshing...' : 'Refresh Products'
          }}
        </button>
        <button
          type="button"
          (click)="liveServices.refreshNow()"
          [disabled]="liveServices.isRefreshing()"
        >
          {{
            liveServices.isRefreshing() ? 'Refreshing...' : 'Refresh Services'
          }}
        </button>
        <button
          type="button"
          class="secondary"
          (click)="productsSse.reconnect()"
        >
          Reconnect Product SSE
        </button>
        <button
          type="button"
          class="secondary"
          (click)="servicesSse.reconnect()"
        >
          Reconnect Service SSE
        </button>
      </div>
    </section>

    <section class="service-grid">
      <article class="service-card">
        <h3>Live Products Service</h3>
        <p>Polling: {{ liveProducts.pollingActive() ? 'active' : 'idle' }}</p>
        <p>Interval: {{ liveProducts.pollIntervalMs / 1000 }}s</p>
        <p>Refreshes: {{ liveProducts.refreshCount() }}</p>
        <p>
          Last refresh reason:
          {{ liveProducts.lastRefreshReason() ?? 'waiting' }}
        </p>
        <p>Last refresh at: {{ liveProducts.lastRefreshAt() ?? 'waiting' }}</p>
      </article>

      <article class="service-card">
        <h3>Products SSE Service</h3>
        <p>Status: {{ productsSse.status() }}</p>
        <p>Events received: {{ productsSse.eventCount() }}</p>
        <p>Last event at: {{ productsSse.lastEventAt() ?? 'waiting' }}</p>
        <p>
          Last payload size:
          {{ productsSse.latestProducts()?.length ?? 0 }}
        </p>
      </article>

      <article class="service-card">
        <h3>Live Services Service</h3>
        <p>Polling: {{ liveServices.pollingActive() ? 'active' : 'idle' }}</p>
        <p>Interval: {{ liveServices.pollIntervalMs / 1000 }}s</p>
        <p>Refreshes: {{ liveServices.refreshCount() }}</p>
        <p>
          Last refresh reason:
          {{ liveServices.lastRefreshReason() ?? 'waiting' }}
        </p>
        <p>Last refresh at: {{ liveServices.lastRefreshAt() ?? 'waiting' }}</p>
      </article>

      <article class="service-card">
        <h3>Services SSE Service</h3>
        <p>Status: {{ servicesSse.status() }}</p>
        <p>Events received: {{ servicesSse.eventCount() }}</p>
        <p>Last event at: {{ servicesSse.lastEventAt() ?? 'waiting' }}</p>
        <p>
          Last payload size:
          {{ servicesSse.latestServices()?.length ?? 0 }}
        </p>
      </article>
    </section>

    <section class="catalog-header">
      <div>
        <p class="eyebrow">Catalog</p>
        <p class="summary">
          Showing {{ products().length }} product{{
            products().length === 1 ? '' : 's'
          }}.
        </p>
      </div>
      <div class="status-chip">
        SSE {{ productsSse.status() }} ·
        {{ liveProducts.refreshCount() }} refreshes
      </div>
    </section>

    <div class="product-grid">
      @for (product of products(); track product.id) {
        <article class="product-card">
          @let productLink =
            routePath('/products/[productId]', {
              params: { productId: '' + product.id },
            });
          <div class="product-card-header">
            <div>
              <p class="product-label">Product #{{ product.id }}</p>
              <h3>
                <a
                  [title]="product.name + ' details'"
                  [routerLink]="productLink.path"
                >
                  {{ product.name }}
                </a>
              </h3>
            </div>
            <p class="price">{{ product.price | currency }}</p>
          </div>
          @if (product.description) {
            <p>Description: {{ product.description }}</p>
          }
          <div class="actions">
            <button type="button" (click)="share()">Share</button>
            <analogjs-product-alerts
              [product]="product"
              (notify)="onNotify()"
            />
          </div>
        </article>
      }
    </div>

    <section class="catalog-header">
      <div>
        <p class="eyebrow">Services</p>
        <p class="summary">
          Showing {{ services().length }} service{{
            services().length === 1 ? '' : 's'
          }}.
        </p>
      </div>
      <div class="status-chip">
        SSE {{ servicesSse.status() }} ·
        {{ liveServices.refreshCount() }} refreshes
      </div>
    </section>

    <div class="catalog-grid">
      @for (service of services(); track service.id) {
        <article class="product-card">
          <div class="product-card-header">
            <div>
              <p class="product-label">Service #{{ service.id }}</p>
              <h3>{{ service.name }}</h3>
            </div>
            <p class="price">{{ service.price | currency }}</p>
          </div>
          <p>{{ service.description }}</p>
        </article>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
        gap: 1.5rem;
        align-items: start;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        border: 1px solid rgb(37 99 235 / 0.12);
        border-radius: 24px;
        background:
          linear-gradient(145deg, rgb(37 99 235 / 0.08), transparent 55%), #fff;
        box-shadow: 0 24px 60px rgb(15 23 42 / 0.08);
      }

      .hero-copy,
      .hero-actions {
        display: grid;
        gap: 0.9rem;
      }

      .hero-text {
        max-width: 60ch;
      }

      .eyebrow,
      .product-label {
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #2563eb;
      }

      .hero-actions {
        align-content: start;
      }

      h3 {
        margin: 0 0 0.5rem;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .service-grid,
      .product-grid,
      .catalog-grid {
        display: grid;
        gap: 1rem;
      }

      .service-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-bottom: 1rem;
      }

      .product-grid {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        margin-bottom: 2rem;
      }

      .catalog-grid {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }

      .service-card,
      .product-card {
        border: 1px solid #d9e2ec;
        border-radius: 20px;
        padding: 1.1rem;
        background: #fff;
        box-shadow: 0 16px 36px rgb(15 23 42 / 0.07);
      }

      .service-card {
        background: linear-gradient(180deg, #fff, #f8fbff);
      }

      .catalog-header,
      .product-card-header {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 1rem;
      }

      .catalog-header {
        margin-bottom: 1rem;
      }

      .status-chip {
        padding: 0.6rem 0.9rem;
        border-radius: 999px;
        background: rgb(37 99 235 / 0.1);
        color: #1d4ed8;
        font-size: 0.9rem;
        font-weight: 700;
      }

      .product-label {
        margin-bottom: 0.35rem;
      }

      .summary,
      .price {
        font-weight: 600;
      }

      .price {
        margin: 0;
        color: #0f172a;
        white-space: nowrap;
      }

      .secondary {
        background: #fff;
        color: #2563eb;
        border: 1px solid rgb(37 99 235 / 0.18);
        box-shadow: none;
      }

      .secondary:hover {
        background: #eff6ff;
      }

      @media (max-width: 900px) {
        .hero {
          grid-template-columns: 1fr;
        }

        .catalog-header,
        .product-card-header {
          flex-direction: column;
        }
      }
    `,
  ],
})
export default class ProductListComponent {
  readonly routePath = routePath;
  private readonly initialData = toSignal(injectLoad<typeof load>(), {
    requireSync: true,
  });
  readonly liveProducts = inject(LiveProductsService);
  readonly liveServices = inject(LiveServicesService);
  readonly productsSse = inject(ProductsSseService);
  readonly servicesSse = inject(ServicesSseService);
  readonly showPremiumOnly = signal(false);
  readonly sortByPriceDesc = signal(false);

  readonly products = computed(() => {
    let products = [...this.liveProducts.products()];

    if (this.showPremiumOnly()) {
      products = products.filter((product) => product.price >= 700);
    }

    if (this.sortByPriceDesc()) {
      products = [...products].sort((a, b) => b.price - a.price);
    }

    return products;
  });

  readonly services = computed(() => this.liveServices.services());

  constructor() {
    // Seed the client store with the SSR loader snapshot before starting the
    // live refresh flow so hydration keeps the server-rendered product list.
    this.liveProducts.connect(this.initialData().products);
    this.liveServices.connect(this.initialData().services);
  }

  share() {
    window.alert('The product has been shared!');
  }

  togglePremiumOnly() {
    this.showPremiumOnly.update((value) => !value);
  }

  togglePriceSort() {
    this.sortByPriceDesc.update((value) => !value);
  }

  onNotify() {
    window.alert('You will be notified when the product goes on sale');
  }
}
