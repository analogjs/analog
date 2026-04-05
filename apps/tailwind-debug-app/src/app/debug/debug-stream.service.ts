import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  TAILWIND_DEBUG_BREADCRUMB_EVENT,
  type HmrBreadcrumb,
} from './hmr-diagnostics';
import {
  type TailwindDebugEventEntry,
  type TailwindDebugSocketMessage,
  toBrowserEntry,
} from './debug-stream.shared';

const STREAM_LIMIT = 200;

function appendEntry(
  entries: readonly TailwindDebugEventEntry[],
  nextEntry: TailwindDebugEventEntry,
) {
  return [...entries, nextEntry].slice(-STREAM_LIMIT);
}

@Injectable({ providedIn: 'root' })
export class TailwindDebugStreamService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly clientId = Math.random().toString(36).slice(2, 10);
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private queuedMessages: string[] = [];

  readonly connectionState = signal<'closed' | 'connecting' | 'open'>(
    this.isBrowser ? 'connecting' : 'closed',
  );
  readonly entries = signal<TailwindDebugEventEntry[]>([]);
  readonly sourceCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const entry of this.entries()) {
      counts[entry.source] = (counts[entry.source] ?? 0) + 1;
    }
    return counts;
  });
  readonly latestEntry = computed(() => {
    const entries = this.entries();
    return entries[entries.length - 1];
  });
  readonly fullReloadCount = computed(
    () =>
      this.entries().filter((entry) => {
        const payload = entry.payload as { type?: string };
        return entry.source === 'vite:ws' && payload.type === 'full-reload';
      }).length,
  );
  readonly browserErrorCount = computed(
    () =>
      this.entries().filter((entry) => {
        const payload = entry.payload as { phase?: string };
        return (
          entry.source === 'browser' &&
          (payload.phase === 'window:error' ||
            payload.phase === 'window:unhandledrejection')
        );
      }).length,
  );

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    this.seedFromWindow();
    this.connect();

    const onBreadcrumb = (event: Event) => {
      const detail = (event as CustomEvent<HmrBreadcrumb>).detail;
      const entry = toBrowserEntry(detail, this.clientId);
      this.entries.update((entries) => appendEntry(entries, entry));
      this.send({
        entry,
        type: 'entry',
      } satisfies TailwindDebugSocketMessage);
    };

    window.addEventListener(TAILWIND_DEBUG_BREADCRUMB_EVENT, onBreadcrumb);
    this.destroyRef.onDestroy(() => {
      if (this.reconnectTimer) {
        window.clearTimeout(this.reconnectTimer);
      }
      window.removeEventListener(TAILWIND_DEBUG_BREADCRUMB_EVENT, onBreadcrumb);
      this.socket?.close();
    });
  }

  reconnect() {
    if (!this.isBrowser) {
      return;
    }

    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.socket?.close();
    this.connectionState.set('connecting');
    this.connect();
  }

  clear() {
    this.entries.set([]);
  }

  private connect() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/ws/debug-stream`,
    );
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.connectionState.set('open');
      if (this.reconnectTimer) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }
      for (const message of this.queuedMessages) {
        socket.send(message);
      }
      this.queuedMessages = [];
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data) as TailwindDebugSocketMessage;
        if (message.type === 'snapshot' && message.entries) {
          const serverEntries = message.entries.filter(
            (entry) => entry.clientId !== this.clientId,
          );
          this.entries.update((entries) =>
            [...entries, ...serverEntries].slice(-STREAM_LIMIT),
          );
        }

        if (message.type === 'entry' && message.entry) {
          if (message.entry.clientId === this.clientId) {
            return;
          }
          this.entries.update((entries) =>
            appendEntry(entries, message.entry!),
          );
        }
      } catch {
        // Ignore malformed diagnostics messages.
      }
    });

    let closed = false;
    const onClosed = () => {
      if (closed || this.socket !== socket) {
        return;
      }
      closed = true;
      this.connectionState.set('closed');
      this.socket = undefined;
      this.reconnectTimer = window.setTimeout(() => {
        this.connectionState.set('connecting');
        this.connect();
      }, 1000);
    };

    socket.addEventListener('close', onClosed);
    socket.addEventListener('error', onClosed);
  }

  private seedFromWindow() {
    const debugState = window.__TAILWIND_DEBUG__;
    const previousEntries = debugState?.previousSessionBreadcrumbs ?? [];
    const sessionEntries = debugState?.breadcrumbs ?? [];

    const seededEntries = [...previousEntries, ...sessionEntries].map(
      (breadcrumb) => toBrowserEntry(breadcrumb, this.clientId),
    );
    this.entries.set(seededEntries.slice(-STREAM_LIMIT));
  }

  private send(message: TailwindDebugSocketMessage) {
    const encoded = JSON.stringify(message);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(encoded);
      return;
    }
    this.queuedMessages.push(encoded);
  }
}
