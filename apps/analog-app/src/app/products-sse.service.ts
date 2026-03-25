import { Injectable, signal } from '@angular/core';

import type { Product } from './products';

@Injectable({
  providedIn: 'root',
})
export class ProductsSseService {
  readonly latestProducts = signal<Product[] | null>(null);
  readonly status = signal<'idle' | 'connecting' | 'open' | 'error'>('idle');
  readonly eventCount = signal(0);
  readonly lastEventAt = signal<string | null>(null);

  private eventSource?: EventSource;
  private readonly listeners = new Set<(products: Product[]) => void>();

  connect(onProductsChanged?: (products: Product[]) => void) {
    if (onProductsChanged) {
      this.listeners.add(onProductsChanged);
    }

    if (typeof EventSource === 'undefined' || this.eventSource) {
      return;
    }

    this.status.set('connecting');
    const eventSource = new EventSource('/api/v1/products-sse');
    eventSource.onopen = () => {
      this.status.set('open');
    };
    eventSource.onmessage = (event) => {
      try {
        const products = JSON.parse(event.data) as Product[];
        this.latestProducts.set(products);
        this.eventCount.update((count) => count + 1);
        this.lastEventAt.set(new Date().toLocaleTimeString());
        for (const listener of this.listeners) {
          listener(products);
        }
      } catch {
        // Ignore malformed SSE payloads and keep the last good event payload.
      }
    };
    eventSource.onerror = () => {
      // EventSource retries automatically while the connection stays open.
      // Reset the handle only after the browser gives up completely.
      if (eventSource.readyState === EventSource.CLOSED) {
        eventSource.close();
        this.status.set('error');
        if (this.eventSource === eventSource) {
          this.eventSource = undefined;
        }
        return;
      }

      this.status.set('connecting');
    };

    this.eventSource = eventSource;
  }

  reconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    this.status.set('idle');
    this.connect();
  }
}
