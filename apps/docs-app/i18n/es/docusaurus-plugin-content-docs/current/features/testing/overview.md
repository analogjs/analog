import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Ejecutando Pruebas

Analog soporta [Vitest](https://vitest.dev) para ejecutar pruebas unitarias.

## Características de Vitest

Vitest soporta muchas características:

- Una API compatible con Jest.
- Soporta la configuración, transformaciones, resoluciones y plugins de Vite.
- Modo de observación inteligente e instantáneo.
- Soporte de TypeScript.
- Soporte de snapshots compatibles con Jest.
- jsdom para el mockeo del DOM.
- Pruebas en el código fuente.
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
