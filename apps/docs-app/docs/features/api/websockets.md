# WebSocket

Analog also supports `WebSockets` and `Server-Sent Events` through Nitro.

## Enabling WebSockets

Currently, WebSocket support in [Nitro](https://nitro.unjs.io/guide/websocket) is experimental and it can be enabled in the `analog` plugin:

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

**Note:** In development, the Vite HMR WebSocket server runs on the same port as the dev server by default. To prevent conflicts, you need to change this port. The dev server port is usually defined in `project.json`/`angular.json`, which takes precedence over `vite.config.ts`. To allow the port settings in `vite.config.ts` to take effect, remove the port definition from `project.json`/`angular.json`. Additionally, you can specify an optional path to easily differentiate connections in the browser dev tools:

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

## Defining a WebSocket Handler

Similar to [API routes](/docs/features/api/overview), WebSocket Handlers are defined in the `src/server/routes/api` folder.

```typescript
// src/server/api/routes/ws/chat.ts
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

### WebSocket Routes

WebSocket routes are exposed with the same path as API routes. For example, `src/server/routes/api/ws/chat` is exposed as `ws://example.com/api/ws/chat`.

## Defining a Server-sent Event Handler

Server-sent event handlers can be created using `createEventStream` function in the event handler.

```typescript
// src/server/routes/api/sse.ts
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

## More Info

WebSockets are powered by [Nitro](https://nitro.unjs.io/guide/websocket), [h3](https://h3.unjs.io/guide/websocket) and [crossws](https://crossws.unjs.io/guide). See the Nitro, h3 and crossws docs for more details.
