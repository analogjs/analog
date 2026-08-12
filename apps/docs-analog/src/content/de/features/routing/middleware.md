# Middleware

Analog unterstützt serverseitige Middleware, die verwendet werden kann, um Anfragen zu ändern, die Authentifizierung zu überprüfen, Weiterleitungen zu senden und vieles mehr.

## Middleware einrichten

Eine Middleware wird automatisch registriert, wenn sie im Ordner `src/server/middleware` platziert wird.

```treeview
src/
└── server/
    └── middleware/
        └── auth.ts
```

Eine Middleware wird mit der Funktion `defineHandler` definiert.

```ts
import { defineHandler, redirect } from 'h3';

export default defineHandler((event) => {
  if (event.path === '/checkout') {
    event.res.headers.set('x-analog-checkout', 'true');
    return redirect('/cart', 302);
  }
});
```

- Eine Middleware kann den Anfrage- oder Antwortkontext anpassen oder eine Antwort zurückgeben, um die Verarbeitung fruehzeitig zu beenden.
- Eine Middleware wird in der Reihenfolge der definierten Dateinamen ausgeführt. Setze den Dateinamen eine Zahl voran, um eine bestimmte Reihenfolge zu erzwingen.

## Filterung in Middleware

Eine Middleware kann durch Filterung nur auf bestimmte Routen angewendet werden.

```ts
import { defineHandler, getCookie, redirect } from 'h3';

export default defineHandler(async (event) => {
  // Only execute for /admin routes
  if (event.url.pathname.startsWith('/admin')) {
    const authToken = getCookie(event, 'authToken');

    // check auth and redirect
    if (!authToken) {
      return redirect('/login', 401);
    }
  }
});
```
