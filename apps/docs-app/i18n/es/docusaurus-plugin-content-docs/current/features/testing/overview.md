import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Ejecución de pruebas

Analog soporta [Vitest](https://vitest.dev) para ejecutar las pruebas unitarias.

## Características de Vitest

Vitest ofrece varias características:

- API compatible con Jest.
- Soporta la configuración, transformadores, resolucionadores y plugins de Vite.
- Modo de observación inteligente e instantáneo.
- Soporte para TypeScript.
- Instantáneas compatibles con Jest.
- jsdom para simulación del DOM.
- Pruebas directas en el código fuente.
- Y mucho más...

## Ejecutando pruebas unitarias

Para ejecutar pruebas unitarias, utiliza el comando `test`:

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

También puedes [incorporar Vitest](/docs/features/testing/vitest) a tu proyecto existente.
