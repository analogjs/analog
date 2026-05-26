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

Además, si no está presente, agregar los archivos de middleware en el arreglo `include` en el archivo `tsconfig.app.json`.

```json
{
  // other config ...
  "include": [
    "src/**/*.d.ts",
    "src/app/pages/**/*.page.ts",
    "src/server/middleware/**/*.ts" <----
  ],
}
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

## Accediendo a las Variables de Entorno

Utilice el objeto global `process.env` para acceder a las variables de entorno dentro de las funciones del middleware. Tanto las variables de entorno exclusivas para el servidor como las de acceso público definidas en los archivos `.env` pueden leerse desde el middleware.

```ts
import { defineEventHandler, getRequestURL } from 'h3';

export default defineEventHandler((event) => {
  console.log('Path:', getRequestURL(event).pathname);
  console.log(
    'Server Only Environment Variable:',
    process.env['SERVER_ONLY_VARIABLE'],
  );
  console.log(
    'Public Environment Variable:',
    process.env['VITE_EXAMPLE_VARIABLE'],
  );
});
```

Aprenda más sobre las [variables de entorno](https://vite.dev/guide/env-and-mode.html#env-variables) en la documentación de Vite.
