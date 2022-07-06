# @analogjs/vite-plugin-angular

A Vite plugin for building Angular applications

## Install

yarn add @analogjs/vite-plugin-angular

## Setup

Add the plugin to the `plugins` array in your Vite config

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    mainFields: ['module'],
  },

  plugins: [angular()],
});
```
