---
title: 'Vite'
---

# @analogjs/vite-plugin-angular

是一个用于构建 Angular 应用的 Vite 插件

## 安装

yarn add @analogjs/vite-plugin-angular

## 配置

添加插件到你的 Vite 配置的 `plugins` 列表

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
