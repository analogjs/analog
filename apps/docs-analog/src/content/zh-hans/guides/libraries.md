import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 构建 Angular 类库

Angular 类库是为了支持许多不同的服务和功能而构建的。可以使用 Vite 构建 Angular 类库，并将其发布到 npm。

## 创建类库

如果你正在创建一个新包，请使用 `library` schematic：

```sh
ng generate lib my-lib
```

对于现有的类库，请遵循设置说明。

## 设置

安装 `@analogjs/platform` 包：

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/platform --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/platform --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install -w @analogjs/platform
```

  </TabItem>
</Tabs>

接下来，在项目根目录下创建一个 `vite.config.ts`，并配置它以构建类库。

> 更新 `my-lib` 的引用以匹配类库项目名称。

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/my-lib',
  plugins: [angular()],
  resolve: {
    mainFields: ['module'],
  },
  build: {
    target: ['esnext'],
    sourcemap: true,
    lib: {
      // 类库入口点
      entry: 'src/public-api.ts',

      // 包输出路径，必须包含 fesm2022
      fileName: `fesm2022/my-lib`,

      // 发布为 ESM 包
      formats: ['es'],
    },
    rollupOptions: {
      // 添加应从捆绑包中排除的外部类库
      external: [/^@angular\/.*/, 'rxjs', 'rxjs/operators'],
      output: {
        // 生成单个文件捆绑包
        preserveModules: false,
      },
    },
    minify: false,
  },
}));
```

接下来，更新项目配置以使用 `@analogjs/platform:vite` 构建器来构建类库。

```json
{
  "name": "my-lib",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "projects/my-lib/src",
  "prefix": "lib",
  "projectType": "library",
  "architect": {
    "build": {
      "builder": "@analogjs/platform:vite",
      "options": {
        "configFile": "projects/my-lib/vite.config.ts",
        "outputPath": "dist/projects/my-lib"
      },
      "defaultConfiguration": "production",
      "configurations": {
        "development": {
          "mode": "development"
        },
        "production": {
          "sourcemap": true,
          "mode": "production"
        }
      }
    }
  }
}
```

调整项目根目录下的 `package.json` 以指向构建输出。包含安装包时所需的任何必要的 `dependencies` 或 `peerDependencies`。

```json
{
  "name": "my-lib",
  "description": "Angular 类库的描述",
  "type": "module",
  "peerDependencies": {
    "@angular/common": "^19.0.0",
    "@angular/core": "^19.0.0"
  },
  "dependencies": {
    "tslib": "^2.0.0"
  },
  "types": "./src/public-api.d.ts",
  "exports": {
    "./package.json": {
      "default": "./package.json"
    },
    ".": {
      "import": "./fesm2022/my-lib.mjs",
      "require": "./fesm2022/my-lib.mjs",
      "default": "./fesm2022/my-lib.mjs"
    }
  },
  "sideEffects": false,
  "publishConfig": {
    "access": "public"
  }
}
```

## 复制资产

默认情况下，`public` 目录中的静态资产会复制到构建输出目录。如果要复制该目录之外的其他资产，请使用 `nxCopyAssetsPlugin` Vite 插件。

导入插件并进行设置：

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/vite-plugin-angular';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...
  plugins: [angular(), nxCopyAssetsPlugin(['*.md', 'package.json'])],
}));
```

## 构建类库

运行构建命令：

```sh
ng build my-lib
```

## 发布类库

使用 `npm login` 登录后，使用 `npm publish` 命令发布包。

要查看输出而不发布，请使用 `--dry-run` 标志。

```sh
npm publish dist/projects/my-lib --dry-run
```

要将类库发布到 npm：

```sh
npm publish dist/projects/my-lib
```
