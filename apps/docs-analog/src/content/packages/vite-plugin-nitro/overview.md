---
title: Nitro
---

# @analogjs/vite-plugin-nitro

A lightweight [Vite](https://vite.dev) plugin for integrating with [Nitro](https://nitro.unjs.io) to enable:

- Runtime Server Side Rendering
- Build-time Pre-rendering
- Static Site Generation
- API routes
- Sitemaps

## Install

npm install @analogjs/vite-plugin-nitro --save-dev

## Setup

Add the `nitro` plugin to the `plugins` array in the Vite config.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import nitro from '@analogjs/vite-plugin-nitro';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nitro({
      analog: {
        ssr: true,
        entryServer: 'src/main.server.tsx',
        prerender: {
          routes: ['/'],
        },
      },
    }),
  ],
});
```

### SSR Setup

Define a `src/main.server.ts(x)` file to declare how to render the application on the server.

Below is a minimal example for SSR w/React:

```ts
import React from 'react';
import ReactDOMServer from 'react-dom/server';

import App from './App';

export default async function render(_url: string, document: string) {
  const html = ReactDOMServer.renderToString(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  return document.replace('<!--app-html-->', html);
}
```

Also setup the placeholder to be replaced in the `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Vite + React + Nitro</title>
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## API Routes

API routes are defined in the `src/server/routes/api` folder. API routes are also filesystem based,
and are exposed under the default `/api` prefix.

```ts
// src/server/routes/api/v1/hello
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => ({ message: 'Hello World' }));
```

The API route can be accessed as `/api/v1/hello`.

## Usage with Analog

In an Analog app, add `nitro()` after `analog()` and `angular()`. The options passed to `analog()`, such as `ssr`, `prerender`, and `apiPrefix`, are used by `nitro()`, which takes the Nitro config. Without `analog()`, pass these options under `analog` as shown above.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import nitro from '@analogjs/vite-plugin-nitro';

export default defineConfig({
  plugins: [
    analog({ prerender: { routes: ['/'] } }),
    angular(),
    nitro({ routeRules: { '/admin/**': { ssr: false } } }),
  ],
});
```

This plugin uses Nitro v2 and h3 v1. To use Nitro v3, import `nitro()` from `nitro/vite` instead; the config passed to it stays the same.

## Custom Source Root Directory

By default, the `src` folder is used as the path for the discovery of server files and API routes. You can customize the folder with the `sourceRoot` option.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import nitro from '@analogjs/vite-plugin-nitro';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    nitro({
      analog: {
        ssr: true,
        entryServer: 'app/main.server.tsx',
        sourceRoot: 'app',
      },
    }),
  ],
});
```

With this configuration, API routes are discovered under the `app/server/routes/api` directory. You can also make the it optional by setting the `sourceRoot` to `'.'`;

## Options

These options go under `analog` in `nitro()`, or on `analog()` in an Analog app. Options under `analog` in `nitro()` override the ones passed to `analog()`.

| Option                   | Default                               | Description                                                                                                                                                                            |
| ------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ssr`                    | `false` (`true` with `analog()`)      | Render pages on the server.                                                                                                                                                            |
| `entryServer`            | `<sourceRoot>/main.server.ts`         | Server entry that renders the app.                                                                                                                                                     |
| `index`                  | `index.html`                          | HTML template used for server rendering in the dev server, relative to the Vite root.                                                                                                  |
| `sourceRoot`             | `src`                                 | Folder used to discover server files and API routes.                                                                                                                                   |
| `workspaceRoot`          | `process.cwd()`                       | Absolute workspace root that other paths resolve against.                                                                                                                              |
| `apiPrefix`              | `api`                                 | URL prefix for API routes.                                                                                                                                                             |
| `additionalAPIDirs`      | `[]`                                  | Extra directories with API routes, relative to the workspace root, such as `/libs/shared/api/src/api`.                                                                                 |
| `additionalServerFnDirs` | `[]`                                  | Extra directories to scan for `*.server.ts` [server function](/docs/features/data-fetching/server-functions) modules, relative to the workspace root, such as `/libs/shared/data/src`. |
| `ssrBuildDir`            | `<workspaceRoot>/dist/<app root>/ssr` | Output directory for the server build.                                                                                                                                                 |

`ssrBuildDir` and `additionalServerFnDirs` aren't options on `analog()`, so in an Analog app pass them under `analog` in `nitro()`:

```ts
nitro({
  analog: {
    additionalServerFnDirs: ['/libs/shared/data/src'],
  },
});
```

## Examples

React: https://github.com/brandonroberts/vite-nitro-react \
SolidJS: https://github.com/brandonroberts/vite-nitro-solid \
Vue: https://github.com/brandonroberts/vite-nitro-vue

## Community

- Visit and Star the [GitHub Repo](https://github.com/analogjs/analog)
- Join the [Discord](https://chat.analogjs.org)
- Follow us on [Twitter](https://twitter.com/analogjs) and [Bluesky](https://bsky.app/profile/analogjs.org)
- Become a [Sponsor](https://github.com/sponsors/brandonroberts)
