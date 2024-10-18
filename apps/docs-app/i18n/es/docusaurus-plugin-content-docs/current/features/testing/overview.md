import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Ejecutando Pruebas

Analog soporta [Vitest](https://vitest.dev) para ejecutar pruebas unitarias.

## Características de Vitest

Vitest soporta muchas características:

- Una API compatible con Jest.
- Soporta la configuración, transformaciones, resolutores y plugins de Vite.
- Modo watch inteligente e instantáneo.
- Soporte para TypeScript.
- Snapshots compatibles con Jest.
- jsdom para la simulación del DOM.
- Pruebas en el mismo archivo (in-source testing).
- Y más ...

## Ejecutando Pruebas Unitarias

Para ejecutar pruebas unitarias, usa el comando `test`:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run test
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn test
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm run test
```

  </TabItem>
</Tabs>

También puedes [añadir Vitest](/docs/features/testing/vitest) a tu proyecto existente.

## Limitaciones Conocidas

- Solo los globals están parcheados con Zone.js. Esto significa que si importas `it`, `describe`, etc. directamente desde `vitest`, no podrás ejecutar `fakeAsync`. En su lugar, usa las funciones (`it`, `describe`, etc.) de la manera en que las usabas en Jest/Jasmine – sin importar estas funciones en el archivo de prueba.
- Se usan `vmThreads`. Esto puede llevar a posibles fugas de memoria y se usa por defecto para proporcionar un entorno más cercano a Jest con JSDOM. Más detalles puedes leer [aquí](https://github.com/vitest-dev/vitest/issues/4685).

  Para cambiar esto – ajusta tu `vite.config.mts`

  ```typescript
  export default defineConfig(({ mode }) => {
    return {
      test: {
        pool: 'threads', // añade esta propiedad
      },
    };
  });
  ```
