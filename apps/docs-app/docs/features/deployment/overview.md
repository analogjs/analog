import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Deployment

Node.js deployment is the default Analog output preset for production builds.

When running `npm run build` with the default preset, the result will be an entry point that launches a ready-to-run Node server.

To start up the standalone server, run:

```bash
$ node dist/analog/server/index.mjs
Listening on http://localhost:3000
```

### Environment Variables

You can customize server behavior using following environment variables:

- `NITRO_PORT` or `PORT` (defaults to `3000`)

## Built-in Presets

Analog can generate different output formats suitable for different [hosting providers](/docs/features/deployment/providers) from the same code base, you can change the deploy preset using an environment variable or `vite.config.ts`.

Using environment variable is recommended for deployments depending on CI/CD.

**Example:** Using `BUILD_PRESET`

```bash
BUILD_PRESET=node-server
```

**Example:** Using `vite.config.ts`

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
