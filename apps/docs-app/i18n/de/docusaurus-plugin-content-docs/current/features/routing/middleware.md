# Middleware

Analog unterstützt serverseitige Middleware, die verwendet werden kann, um Anfragen zu ändern, die Authentifizierung zu überprüfen, Weiterleitungen zu senden und vieles mehr.

## Middleware einrichten

Middleware is automatically registered when placed in the `src/server/middleware` folder.
Middleware wird automatisch registriert, wenn sie im Ordner `src/server/middleware` platziert wird.

```treeview
src/
└── server/
    └── middleware/
        └── auth.ts
```

Middleware wird mit der Funktion `defineEventHandler` definiert.

```ts
import { defineEventHandler, sendRedirect, setHeaders } from 'h3';

export default eventHandler((event) => {
  if (event.node.req.originalUrl === '/checkout') {
    console.log('event url', event.node.req.originalUrl);

    setHeaders(event, {
      'x-analog-checkout': 'true',
    });
  }
});
```

- Middleware sollte nur Anfragen ändern und nichts zurückgeben!
- Middleware wird in der Reihenfolge der definierten Dateinamen ausgeführt. Setze den Dateinamen eine Zahl voran, um eine bestimmte Reihenfolge zu erzwingen.

## Filterung in Middleware

Middleware kann durch Filterung nur auf bestimmte Routen angewendet werden.

```ts
export default defineEventHandler(async (event) => {
  // Only execute for /admin routes
  if (getRequestURL(event).pathname.startsWith('/admin')) {
    const cookies = parseCookies(event);
    const isLoggedIn = cookies['authToken'];

    // check auth and redirect
    if (!isLoggedIn) {
      sendRedirect(event, '/login', 401);
    }
  }
});
```
