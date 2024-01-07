# Renderizado del lado del servidor

Analógico soporta el renderizado del lado del servidor durante el desarrollo y la construcción para producción.

## Transformando paquetes para la compatibilidad con SSR

Algunas dependencias pueden necesitar transformaciones adicionales para funcionar para el renderizado del lado del servidor. Si recibe un error durante el SSR en desarrollo, una opción es agregar el paquete(s) a la matriz `ssr.noExternal` en la configuración de Vite.

Puedes usar patrones glob para incluir conjuntos de paquetes o bibliotecas. Algunos ejemplos se enumeran a continuación.

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  ssr: {
    noExternal: [
      'apollo-angular', // npm package import
      'apollo-angular/**', // npm package import along with sub-packages
      '@spartan-ng/**', // libs under the npmScope inside an Nx workspace
    ],
  },
  // ...other config
}));
```

Para obtener más información sobre los externos con SSR, consulte la [documentación de Vite](https://vitejs.dev/guide/ssr.html#ssr-externals).

## Desactivando SSR

SSR está habilitado por defecto. Puedes optar por no usarlo y generar una compilación sólo para el cliente añadiendo la siguiente opción al plugin `analog()` en tu `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [analog({ ssr: false })],
}));
```

## Prerenderización de rutas

Con SSR, la ruta `"/"` se prerrenderiza por defecto.

Es necesario añadir la ruta `"/"` a la configuración de prerrenderizado para devolver un HTML renderizado cuando el usuario visita la raíz de la aplicación. Las rutas prerrenderizadas pueden ser personalizadas, pero ten en cuenta que también hay que incluir la ruta `"/"`.

```js
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...other config
  plugins: [
    analog({
      prerender: {
        routes: ['/', '/about'],
      },
    }),
  ],
}));
```

Puedes optar por no prerrenderizar pasando un arreglo vacío de rutas.
