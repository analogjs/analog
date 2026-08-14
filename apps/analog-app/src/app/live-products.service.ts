import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { catchError, of } from 'rxjs';

import type { Product } from './products';
import { ProductsSseService } from './products-sse.service';

@Injectable({
  providedIn: 'root',
})
export class LiveProductsService {
  readonly products = signal<Product[]>([]);
  readonly hasSnapshot = signal(false);
  readonly isRefreshing = signal(false);
  readonly refreshCount = signal(0);
  readonly lastRefreshReason = signal<
    'startup' | 'poll' | 'sse' | 'manual' | null
  >(null);
  readonly lastRefreshAt = signal<string | null>(null);
  readonly pollingActive = signal(false);
  readonly pollIntervalMs = 5000;

  private readonly http = inject(HttpClient);
  private readonly productsSse = inject(ProductsSseService);
  private connected = false;

  connect(initialProducts?: Product[]) {
    if (initialProducts && !this.hasSnapshot()) {
      this.setProducts(initialProducts);
    }

    if (this.connected) {
      return;
    }
    this.connected = true;

    if (typeof window === 'undefined') {
      return;
    }

    this.productsSse.connect((products) => {
      this.applyProducts(products, 'sse');
    });

    this.pollingActive.set(true);
    setInterval(() => {
      void this.refreshProducts('poll');
    }, this.pollIntervalMs);
    void this.refreshProducts('startup');
  }

  refreshNow() {
    void this.refreshProducts('manual');
  }

  private setProducts(products: Product[]) {
    this.products.set(products);
    this.hasSnapshot.set(true);
  }

  private applyProducts(
    products: Product[],
    reason: 'startup' | 'poll' | 'sse' | 'manual',
  ) {
    this.setProducts(products);
    this.refreshCount.update((count) => count + 1);
    this.lastRefreshReason.set(reason);
    this.lastRefreshAt.set(new Date().toLocaleTimeString());
  }

  private async refreshProducts(reason: 'startup' | 'poll' | 'sse' | 'manual') {
    this.isRefreshing.set(true);

    try {
      const products = await firstValueFrom(
        this.http
          .get<Product[]>('/api/v1/products')
          .pipe(catchError(() => of(this.products()))),
      );

      this.applyProducts(products, reason);
    } finally {
      this.isRefreshing.set(false);
    }
  }
}
