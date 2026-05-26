# WebSocket

Analog unterstützt auch `WebSockets` und `Server-Sent Events` über Nitro.

## Aktiviere WebSockets

Derzeit ist die WebSocket-Unterstützung in [Nitro](https://nitro.unjs.io/guide/websocket) experimentell und kann im `analog` Plugin aktiviert werden:

`vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig({
  // ...
  plugins: [
    analog({
      // ...
      nitro: {
        experimental: {
          websocket: true,
        },
      },
    }),
  ],
  // ...
});
```

**Hinweis:** In der Entwicklung läuft der Vite HMR WebSocket-Server standardmäßig auf demselben Port wie der Entwicklungsserver. Um Konflikte zu vermeiden, musst du diesen Port ändern. Der Port des Entwicklungsservers ist normalerweise in `project.json`/`angular.json` definiert, was Vorrang vor `vite.config.ts` hat. Damit die Port-Einstellungen in `vite.config.ts` wirksam werden, entferne die Port-Definition aus `project.json`/`angular.json`. Zusätzlich kannst du einen optionalen Pfad angeben, um Verbindungen in den Browser-Entwicklertools einfach zu unterscheiden:

`vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig({
  // ...
  server: {
    port: 3000, // dev-server port
    hmr: {
      port: 3002, // hmr ws port
      path: 'vite-hmr', // optional
    },
  },
  // ...
});
```

## WebSocket-Handler definieren

Ähnlich wie [API-Routen](/de/docs/features/api/overview) werden WebSocket-Handler im Ordner `src/server/routes` definiert.

```typescript
// src/server/routes/ws/chat.ts
import { defineWebSocketHandler } from 'h3';

export default defineWebSocketHandler({
  open(peer) {
    peer.send({ user: 'server', message: `Welcome ${peer}!` });
    peer.publish('chat', { user: 'server', message: `${peer} joined!` });
    peer.subscribe('chat');
  },
  message(peer, message) {
    if (message.text().includes('ping')) {
      peer.send({ user: 'server', message: 'pong' });
    } else {
      const msg = {
        user: peer.toString(),
        message: message.toString(),
      };
      peer.send(msg); // echo
      peer.publish('chat', msg);
    }
  },
  close(peer) {
    peer.publish('chat', { user: 'server', message: `${peer} left!` });
  },
});
```

### WebSocket-Routen

Analog's internal API middleware is not applied to WebSocket routes, therefore, WebSocket routes are exposed without the `/api` prefix.
Die interne API-Middleware von Analog wird nicht auf WebSocket-Routen angewendet, daher werden WebSocket-Routen ohne das Präfix `/api` verfügbar gemacht.

Beispielsweise wird `src/server/routes/ws/chat.ts` als `ws://example.com/ws/chat` statt als `ws://example.com/api/ws/chat` verfügbar gemacht.

## Server-Sent Event Handler definieren

Server-Sent Event Handler können mit der Funktion `createEventStream` im Event-Handler erstellt werden.

```typescript
// src/server/routes/sse.ts
import { defineEventHandler, createEventStream } from 'h3';

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event);

  const interval = setInterval(async () => {
    await eventStream.push(`Message @ ${new Date().toLocaleTimeString()}`);
  }, 1000);

  eventStream.onClosed(async () => {
    clearInterval(interval);
    await eventStream.close();
  });

  return eventStream.send();
});
```

## Weitere Informationen

WebSockets werden von [Nitro](https://nitro.unjs.io/guide/websocket), [h3](https://h3.unjs.io/guide/websocket) und [crossws](https://crossws.unjs.io/guide) unterstützt. Weitere Informationen findest du in den Dokumenten zu Nitro, h3 und crossws.
