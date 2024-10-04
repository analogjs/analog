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
- `NITRO_HOST` or `HOST`

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

## Deploying with a Custom URL Prefix

If you are deploying with a custom URL prefix, such as https://domain.com/ `basehref` you must do these steps for [server-side-data-fetching](https://analogjs.org/docs/features/data-fetching/server-side-data-fetching), [html markup and assets](https://angular.io/api/common/APP_BASE_HREF), and [dynamic api routes](https://analogjs.org/docs/features/api/overview) to work correctly on the specified `basehref`.

1. Update the `app.config.ts` file to use the new file.

This instructs Angular on how recognize and generate URLs.

```ts
import { APP_BASE_HREF } from '@angular/common';

export const appConfig: ApplicationConfig = {
  providers: [
    [{ provide: APP_BASE_HREF, useValue: import.meta.env.BASE_URL || '/' }],
    ...
  ],
};
```

3. In CI production build

```bash
  # sets the base url for server-side data fetching
  export VITE_ANALOG_PUBLIC_BASE_URL="https://domain.com/basehref"
  # Prefixes all assets and html with /basehref/
  # if using nx:
  npx nx run appname:build:production --baseHref='/basehref/'
  # if using angular build directly:
  npx ng build --baseHref="/basehref/"
```

4. In production containers specify the env flag `NITRO_APP_BASE_URL`.

```bash
NITRO_APP_BASE_URL="/basehref/"
```

Given a `vite.config.ts` file similar to this:

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
            return [];
          }
        }
```

Nitro prefixes all API routes with `/basehref/api`.
