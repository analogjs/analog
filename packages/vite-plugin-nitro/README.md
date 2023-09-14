# @analogjs/vite-plugin-nitro

A Vite plugin for integrating with [Nitro](https://nitro.unjs.io).

## Install

npm install @analogjs/vite-plugin-nitro --save-dev

## Setup

Add the plugin to the `plugins` array in your Vite config

```ts
import { defineConfig } from 'vite';
import nitro from '@analogjs/vite-plugin-nitro';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    mainFields: ['module'],
  },

  plugins: [nitro()],
});
```
