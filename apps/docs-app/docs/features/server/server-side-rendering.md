# Server Side Rendering

Analog supports server-side rendering during development and building for production.

SSR is enabled by default. You can opt out of it and generate a client-only build by
adding the following option to the `analog()` plugin in your `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [analog({ ssr: false })],
}));
```
