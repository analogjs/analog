# WebSocket

Analog también soporta `WebSockets` y `Server-Sent Events` a través de Nitro.

## Activando WebSockets

Actualmente, el soporte de WebSocket en [Nitro](https://nitro.unjs.io/guide/websocket) es experimental y puede ser activado mediante el plugin de `analog`:

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

**Nota:** En desarrollo, el servidor HMR WebSocket de Vite se ejecuta en el mismo puerto que el servidor de desarrollo por defecto. Para evitar conflictos, debes cambiar este puerto. El puerto del servidor de desarrollo suele definirse en `project.json` / `angular.json`, que tiene prioridad sobre `vite.config.ts`. Para permitir que los ajustes del puerto en `vite.config.ts` tengan efecto, elimine la definición de puerto de `project.json` / `angular.json`. Además, puede especificar una ruta opcional para diferenciar fácilmente las conexiones en las herramientes de desarrollo del navegador:

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

## Definiendo un WebSocket Handler

Similar a las [rutas de API](/docs/features/api/overview), WebSocket Handlers son definidos en la misma carpeta `src/server/routes/api`.

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

### Rutas WebSocket

Las rutas de WebSocket se exponen con la misma ruta que las rutas de API. Por ejemplo, `src/server/routes/api/ws/chat` se expone como `ws://example.com/api/ws/chat`.

## Definiendo un Server-sent Event Handler

Los Server-sent event handlers pueden ser creados utilizando la función `createEventStream` en el gestor de eventos.

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

## Más información

Los WebSockets son provistos por [Nitro](https://nitro.unjs.io/guide/websocket), [h3](https://h3.unjs.io/guide/websocket) y [crossws](https://crossws.unjs.io/guide). Chequee la documentación de Nitro, h3 y crossws para más detalles.
