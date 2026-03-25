import { Injectable, signal } from '@angular/core';

import type { Service } from './services';

@Injectable({
  providedIn: 'root',
})
export class ServicesSseService {
  readonly latestServices = signal<Service[] | null>(null);
  readonly status = signal<'idle' | 'connecting' | 'open' | 'error'>('idle');
  readonly eventCount = signal(0);
  readonly lastEventAt = signal<string | null>(null);

  private eventSource?: EventSource;
  private readonly listeners = new Set<(services: Service[]) => void>();

  connect(onServicesChanged?: (services: Service[]) => void) {
    if (onServicesChanged) {
      this.listeners.add(onServicesChanged);
    }

    if (typeof EventSource === 'undefined' || this.eventSource) {
      return;
    }

    this.status.set('connecting');
    const eventSource = new EventSource('/api/v1/services-sse');
    eventSource.onopen = () => {
      this.status.set('open');
    };
    eventSource.onmessage = (event) => {
      try {
        const services = JSON.parse(event.data) as Service[];
        this.latestServices.set(services);
        this.eventCount.update((count) => count + 1);
        this.lastEventAt.set(new Date().toLocaleTimeString());
        for (const listener of this.listeners) {
          listener(services);
        }
      } catch {
        // Ignore malformed SSE payloads and keep the last good event payload.
      }
    };
    eventSource.onerror = () => {
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
