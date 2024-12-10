# @analogjs/vite-plugin-nitro

A lightweight [Vite](https://vite.dev) plugin for integrating with [Nitro](https://nitro.unjs.io) to enable:

- Runtime Server Side Rendering
- Build-time Pre-rendering
- Static Site Generation
- API routes

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
      ssr: true,
      entryServer: 'src/main.server.tsx',
      prerender: {
        routes: ['/'],
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
    </React.StrictMode>
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

## Examples

React: https://github.com/brandonroberts/vite-nitro-react
SolidJS: https://github.com/brandonroberts/vite-nitro-solid
Vue: https://github.com/brandonroberts/vite-nitro-vue

## Community

- Visit and Star the [GitHub Repo](https://github.com/analogjs/analog)
- Join the [Discord](https://chat.analogjs.org)
- Follow us on [Twitter](https://twitter.com/analogjs) and [Bluesky](https://bsky.app/profile/analogjs.org)
- Become a [Sponsor](https://github.com/sponsors/brandonroberts)
