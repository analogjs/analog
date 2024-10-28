# Renderización del Lado del Servidor

Analog soporta la renderización del lado del servidor durante el desarrollo y la construcción para producción.

## Transformando Paquetes para Compatibilidad con SSR

Algunas dependencias pueden necesitar transformaciones adicionales para funcionar con la renderización del lado del servidor. Si recibes un error durante SSR en desarrollo, una opción es añadir el/los paquete(s) al arreglo `ssr.noExternal` en la configuración de Vite.

Puedes usar patrones glob para incluir conjuntos de paquetes o bibliotecas. A continuación se listan algunos ejemplos.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  ssr: {
    noExternal: [
      'apollo-angular', // importación de paquete npm
      'apollo-angular/**', // importación de paquete npm junto con sub-paquetes
      '@spartan-ng/**', // libs bajo el npmScope dentro de un workspace de Nx
    ],
  },
  // ...otra configuración
}));
```

Para más información sobre externals con SSR, consulta la [documentación de Vite](https://vitejs.dev/guide/ssr.html#ssr-externals).

## Deshabilitando SSR

SSR está habilitado por defecto. Puedes optar por no usarlo y generar una compilación solo del cliente añadiendo la siguiente opción al plugin `analog()` en tu `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...otra configuración
  plugins: [analog({ ssr: false })],
}));
```

## Prerenderizando Rutas

Con SSR, la ruta `"/"` se prerenderiza por defecto.

Es un paso necesario para devolver un HTML renderizado cuando el usuario visita la raíz de la aplicación. Las rutas prerenderizadas pueden personalizarse, pero ten en cuenta incluir también la ruta `"/"`.

```js
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...otra configuración
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/about'],
      },
    }),
  ],
}));
```

Puedes optar por no prerenderizar pasando un arreglo vacío de rutas y deshabilitando el prerender en la ruta raíz.

```js
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...otra configuración
  plugins: [
    analog({
      ssr: true,
      nitro: {
        routeRules: {
          '/': {
            prerender: false,
          },
        },
      },
      prerender: {
        routes: async () => {
          return [];
        },
      },
    }),
  ],
}));
```
