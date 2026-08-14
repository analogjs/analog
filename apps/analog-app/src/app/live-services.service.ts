import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { catchError, of } from 'rxjs';

import type { Service } from './services';
import { ServicesSseService } from './services-sse.service';

@Injectable({
  providedIn: 'root',
})
export class LiveServicesService {
  readonly services = signal<Service[]>([]);
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
  private readonly servicesSse = inject(ServicesSseService);
  private connected = false;

  connect(initialServices?: Service[]) {
    if (initialServices && !this.hasSnapshot()) {
      this.setServices(initialServices);
    }

    if (this.connected) {
      return;
    }
    this.connected = true;

    if (typeof window === 'undefined') {
      return;
    }

    this.servicesSse.connect((services) => {
      this.applyServices(services, 'sse');
    });

    this.pollingActive.set(true);
    setInterval(() => {
      void this.refreshServices('poll');
    }, this.pollIntervalMs);
    void this.refreshServices('startup');
  }

  refreshNow() {
    void this.refreshServices('manual');
  }

  private setServices(services: Service[]) {
    this.services.set(services);
    this.hasSnapshot.set(true);
  }

  private applyServices(
    services: Service[],
    reason: 'startup' | 'poll' | 'sse' | 'manual',
  ) {
    this.setServices(services);
    this.refreshCount.update((count) => count + 1);
    this.lastRefreshReason.set(reason);
    this.lastRefreshAt.set(new Date().toLocaleTimeString());
  }

  private async refreshServices(reason: 'startup' | 'poll' | 'sse' | 'manual') {
    this.isRefreshing.set(true);

    try {
      const services = await firstValueFrom(
        this.http
          .get<Service[]>('/api/v1/services')
          .pipe(catchError(() => of(this.services()))),
      );

      this.applyServices(services, reason);
    } finally {
      this.isRefreshing.set(false);
    }
  }
}
