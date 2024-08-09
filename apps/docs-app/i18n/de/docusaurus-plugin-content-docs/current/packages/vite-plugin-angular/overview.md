---
title: ''
---

# @analogjs/vite-plugin-angular

Ein Vite-Plugin für die Erstellung von Angular-Anwendungen

## Installation

Mit npm:

```sh
npm install @analogjs/vite-plugin-angular --save-dev
```

Mit pnpm:

```sh
pnpm install @analogjs/vite-plugin-angular --save-dev
```

Mit yarn:

```sh
yarn install @analogjs/vite-plugin-angular --dev
```

Mit bun:

```sh
bun install @analogjs/vite-plugin-angular --dev
```

## Einrichtung

Füge das Plugin zum Array `plugins` in der Vite-Konfiguration hinzu

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

## Einrichtung der TypeScript-Konfiguration

Die Integration benötigt eine `tsconfig.app.json` im Stammverzeichnis des Projekts zur Kompilierung.

Erstelle eine `tsconfig.app.json` im Stammverzeichnis des Projekts.

```json
{
  "extends": "./tsconfig.json",
  "compileOnSave": false,
  "compilerOptions": {
    "baseUrl": "./",
    "outDir": "./dist/out-tsc",
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "sourceMap": true,
    "declaration": false,
    "downlevelIteration": true,
    "experimentalDecorators": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "noEmit": false,
    "target": "es2020",
    "module": "es2020",
    "lib": ["es2020", "dom"],
    "skipLibCheck": true
  },
  "angularCompilerOptions": {
    "enableI18nLegacyMessageIdFormat": false,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true
  },
  "files": [],
  "include": ["src/**/*.ts"]
}
```
