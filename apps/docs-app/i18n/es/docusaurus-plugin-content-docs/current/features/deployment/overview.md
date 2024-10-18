import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Despliegue

El despliegue en Node.js es el preset de salida predeterminado de Analog para las compilaciones de producción.

Al ejecutar `npm run build` con el preset predeterminado, el resultado será un punto de entrada que lanza un servidor Node listo para ejecutar.

Para iniciar el servidor independiente, ejecuta:

```bash
$ node dist/analog/server/index.mjs
Listening on http://localhost:3000
```

### Variables de Entorno

Puedes personalizar el comportamiento del servidor usando las siguientes variables de entorno:

- `NITRO_PORT` o `PORT` (por defecto `3000`)
- `NITRO_HOST` o `HOST`

## Presets Integrados

Analog puede generar diferentes formatos de salida adecuados para diferentes [proveedores de hosting](/docs/features/deployment/providers) desde la misma base de código. Puedes cambiar el preset de despliegue usando una variable de entorno o `vite.config.ts`.

Se recomienda usar variables de entorno para despliegues que dependen de CI/CD.

**Ejemplo:** Usando `BUILD_PRESET`

```bash
BUILD_PRESET=node-server
```

**Ejemplo:** Usando `vite.config.ts`

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    analog({
      nitro: {
        preset: 'node-server',
      },
    }),
  ],
});
```

## Desplegando con un Prefijo de URL Personalizado

Si estás desplegando con un prefijo de URL personalizado, como https://domain.com/ `basehref`, debes realizar estos pasos para que [server-side-data-fetching](https://analogjs.org/docs/features/data-fetching/server-side-data-fetching), [marcado HTML y activos](https://angular.io/api/common/APP_BASE_HREF), y [rutas API dinámicas](https://analogjs.org/docs/features/api/overview) funcionen correctamente en el `basehref` especificado.

1. Actualiza el archivo `app.config.ts`.

   Esto instruye a Angular sobre cómo reconocer y generar URLs.

   ```ts
   import { ApplicationConfig } from '@angular/core';
   import { APP_BASE_HREF } from '@angular/common';

   export const appConfig: ApplicationConfig = {
     providers: [
       [{ provide: APP_BASE_HREF, useValue: import.meta.env.BASE_URL || '/' }],
       ...
     ],
   };
   ```

2. En la compilación de producción de CI

   ```bash
     # establece la URL base para la obtención de datos del lado del servidor
     export VITE_ANALOG_PUBLIC_BASE_URL="https://domain.com/basehref"
     # Prefija todos los activos y HTML con /basehref/
     # si usas nx:
     npx nx run appname:build:production --baseHref='/basehref/'
     # si usas la compilación directa de Angular:
     npx ng build --baseHref="/basehref/"
   ```

3. En contenedores de producción, especifica la bandera de entorno `NITRO_APP_BASE_URL`.

   ```bash
   NITRO_APP_BASE_URL="/basehref/"
   ```

Dado un archivo `vite.config.ts` similar a este:

```ts
    plugins: [
      analog({
        apiPrefix: 'api',
        nitro: {
          routeRules: {
            '/': {
              prerender: false,
            },
          },
        },
        prerender: {
          routes: async () => {
            return ['/'];
          }
        }
```

Nitro prefija todas las rutas API con `/basehref/api`.
