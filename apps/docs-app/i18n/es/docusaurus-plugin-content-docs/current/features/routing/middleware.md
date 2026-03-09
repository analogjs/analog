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

El middleware se define usando la función `defineHandler`.

```ts
import { defineHandler, redirect } from 'h3';

export default defineHandler((event) => {
  if (event.path === '/checkout') {
    event.res.headers.set('x-analog-checkout', 'true');
    return redirect('/cart', 302);
  }
});
```

- El middleware puede modificar el contexto de la solicitud o respuesta, o devolver una respuesta para detener el manejo de la solicitud.
- El middleware se ejecuta en el orden de los nombres de archivo definidos. Prefija los nombres de archivo con números para imponer un orden particular.

## Filtrado en Middleware

El middleware solo puede aplicarse a rutas específicas utilizando filtrado.

```ts
import { defineHandler, redirect } from 'h3';

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export default defineHandler(async (event) => {
  // Solo se ejecuta para rutas /admin
  if (event.url.pathname.startsWith('/admin')) {
    const authToken = getCookieValue(
      event.req.headers.get('cookie'),
      'authToken',
    );

    // verificar autenticación y redirigir
    if (!authToken) {
      return redirect('/login', 401);
    }
  }
});
```

## Accediendo a las Variables de Entorno

Utilice el objeto global `process.env` para acceder a las variables de entorno dentro de las funciones del middleware. Tanto las variables de entorno exclusivas para el servidor como las de acceso público definidas en los archivos `.env` pueden leerse desde el middleware.

```ts
import { defineHandler } from 'h3';

export default defineHandler((event) => {
  console.log('Path:', event.url.pathname);
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
