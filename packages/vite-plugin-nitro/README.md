# @analogjs/vite-plugin-nitro

A Vite plugin for adding a nitro API server

## Install

yarn add @analogjs/vite-plugin-nitro

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
