# Middleware

Analog soporta middleware del lado del servidor que puede usarse para modificar solicitudes, verificar autenticación, enviar redirecciones y más.

## Configuración del Middleware

El middleware se registra automáticamente cuando se coloca en la carpeta `src/server/middleware`.

```treeview
src/
└── server/
    └── middleware/
        └── auth.ts
```

El middleware se define usando la función `defineEventHandler`.

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

- ¡El middleware solo debe modificar solicitudes y no debe devolver nada!
- El middleware se ejecuta en el orden de los nombres de archivo definidos. Prefija los nombres de archivo con números para imponer un orden particular.

## Filtrado en Middleware

El middleware solo puede aplicarse a rutas específicas utilizando filtrado.

```ts
export default defineEventHandler(async (event) => {
  // Solo se ejecuta para rutas /admin
  if (getRequestURL(event).pathname.startsWith('/admin')) {
    const cookies = parseCookies(event);
    const isLoggedIn = cookies['authToken'];

    // verificar autenticación y redirigir
    if (!isLoggedIn) {
      sendRedirect(event, '/login', 401);
    }
  }
});
```
