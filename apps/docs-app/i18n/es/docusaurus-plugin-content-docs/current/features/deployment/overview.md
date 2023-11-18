import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Despliegue

El despliegue Node.js es el predeterminado en Analog para las compilaciones de producción.

Cuando se ejecuta `npm run build` con la configuración predeterminada, el resultado será un punto de entrada que lanza un servidor Node listo para ejecutarse.

Para iniciar el servidor independiente, ejecutar:

```bash
$ node dist/analog/server/index.mjs
Listening on http://localhost:3000
```

### Variable de entorno

Puedes personalizar el comportamiento del servidor utilizando las siguientes variables de entorno:

- `NITRO_PORT` or `PORT` (defaults to `3000`)
- `NITRO_HOST` or `HOST`

## Presets integrados

Analog puede generar diferentes formatos de salida adecuados para diferentes [proveedores de alojamiento](/docs/features/deployment/providers) desde la misma base de código, puedes cambiar el preset de implementación utilizando una variable de entorno o `vite.config.ts`.

Usando variables de entorno se recomienda para implementaciones que dependen de CI/CD.

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
