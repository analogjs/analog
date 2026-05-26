# WebSocket

Analog 还通过 Nitro 支持 `WebSockets` 和 `Server-Sent Events`。

## 启用 WebSockets

目前，[Nitro](https://nitro.unjs.io/guide/websocket) 中的 WebSocket 支持是实验性的，可以在 `analog` 插件中启用：

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

**注意：** 在开发过程中，Vite HMR WebSocket 服务器默认运行在与开发服务器相同的端口上。为了防止冲突，需要更改此端口。开发服务器端口通常在 `project.json`/`angular.json` 中定义，优先于 `vite.config.ts`。为了使 `vite.config.ts` 中的端口设置生效，请从 `project.json`/`angular.json` 中删除端口定义。此外，可以指定一个可选路径，以便在浏览器开发工具中轻松区分连接：

`vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig({
  // ...
  server: {
    port: 3000, // 开发服务器端口
    hmr: {
      port: 3002, // hmr ws 端口
      path: 'vite-hmr', // 可选
    },
  },
  // ...
});
```

## 定义 WebSocket 处理程序

类似于 [API 路由](/docs/features/api/overview)，WebSocket 处理程序定义在 `src/server/routes/api` 文件夹中。

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

### WebSocket 路由

WebSocket 路由与 API 路由的路径相同。例如，`src/server/routes/api/ws/chat` 暴露为 `ws://example.com/api/ws/chat`。

## 定义 Server-sent Event 处理程序

可以使用事件处理程序中的 `createEventStream` 函数创建 Server-sent 事件处理程序。

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

## 更多信息

WebSockets 由 [Nitro](https://nitro.unjs.io/guide/websocket)、[h3](https://h3.unjs.io/guide/websocket) 和 [crossws](https://crossws.unjs.io/guide) 提供支持。有关更多详细信息，请参阅 Nitro、h3 和 crossws 文档。 WebSocket
