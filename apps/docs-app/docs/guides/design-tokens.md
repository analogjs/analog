---
title: 'Design Tokens'
---

Analog can now prototype a first-class design token pipeline through `experimental.designTokens` in `analog()`.

This integration is intentionally narrow:

- Analog owns watch mode, virtual module serving, and default CSS injection
- [Style Dictionary v5](https://styledictionary.com/) owns token transforms and output generation
- Tailwind, daisyUI, Spartan, PrimeNG, MUI, and other framework bridges stay in your Style Dictionary config instead of being hard-coded into Analog

## Install

```sh
pnpm add -D style-dictionary
```

## Configure Analog

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    analog({
      experimental: {
        designTokens: {
          configFile: 'style-dictionary.config.ts',
        },
      },
    }),
    tailwindcss(),
  ],
});
```

## TypeScript config

Use `defineDesignTokensConfig()` for a typed config file and let Style Dictionary generate the outputs you need.

```ts
import { defineDesignTokensConfig } from '@analogjs/platform';

export default defineDesignTokensConfig({
  source: ['tokens/**/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'css/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
          options: {
            analog: {
              inject: true,
            },
          },
        },
        {
          destination: 'framework/tailwind.css',
          format: 'css/variables',
          options: {
            analog: {
              framework: ['tailwind', 'daisyui', 'spartan'],
              inject: false,
            },
          },
        },
        {
          destination: 'framework/mui.css',
          format: 'css/variables',
          options: {
            analog: {
              framework: 'mui',
              inject: false,
            },
          },
        },
        {
          destination: 'framework/primeng.css',
          format: 'css/variables',
          options: {
            analog: {
              framework: 'primeng',
              inject: false,
            },
          },
        },
      ],
    },
    js: {
      transformGroup: 'js',
      buildPath: 'ts/',
      files: [
        {
          destination: 'tokens.js',
          format: 'javascript/es6',
        },
      ],
    },
  },
});
```

Analog builds those outputs into an internal workspace cache, injects the CSS files marked with `analog.inject !== false`, and exposes every emitted CSS file as a virtual module.

The generated virtual manifest also groups outputs by framework so shared libraries can discover bridge files without hard-coding every path themselves:

```ts
import outputs, {
  getOutputsForFramework,
  outputsByFramework,
} from 'virtual:analog-design-tokens';
```

## Import framework-specific CSS

Use `designTokenCss()` when a framework wants its own explicit token bridge stylesheet.

```ts
import { designTokenCss } from '@analogjs/platform';
```

```css
@import 'tailwindcss';
@import 'virtual:analog-design-tokens/file/css/framework/tailwind.css';
```

Or in TypeScript:

```ts
import { designTokenCss } from '@analogjs/platform';

await import(designTokenCss('css/framework/mui.css'));
```

## Why this belongs in Analog

This is not just a convenience wrapper around Vite.

- Astro manages route-aware CSS as framework-owned virtual modules in [`packages/astro/src/vite-plugin-css/index.ts`](https://github.com/withastro/astro/blob/main/packages/astro/src/vite-plugin-css/index.ts). It walks the module graph and serves per-page CSS state from virtual ids.
- Nuxt formalizes generated runtime artifacts and watch-aware templates in [`packages/nuxt/src/components/module.ts`](https://github.com/nuxt/nuxt/blob/main/packages/nuxt/src/components/module.ts) through template generation and framework hooks.
- Angular already treats templates and stylesheets as compiler resources in [`packages/language-service/src/adapters.ts`](https://github.com/angular/angular/blob/main/packages/language-service/src/adapters.ts), including external resource tracking and modified-resource invalidation.

Short version:

- Astro proves style identity and CSS serving become framework concerns once correctness matters in dev and SSR.
- Nuxt proves first-class framework capabilities often need generated virtual/runtime artifacts, not only bundler plugins.
- Angular proves styles already sit on a compiler resource boundary that Analog owns.

That is why Analog should own token output lifecycle, virtual module identity, watch invalidation, and Angular resource integration while leaving Tailwind semantics and framework-specific token schemas to Style Dictionary outputs.

## Tailwind guidance

Keep Tailwind responsible for Tailwind features:

- use `@tailwindcss/vite`
- keep one root stylesheet
- import your token bridge CSS into that stylesheet
- let Style Dictionary emit CSS variables and bridge files

Analog should not reimplement Tailwind theme semantics, plugin APIs, or utility generation. Its job is to keep generated token styles inside the normal Vite and Angular stylesheet lifecycle.

## Debugging

Enable token pipeline diagnostics with:

```sh
DEBUG=analog:platform:tokens,analog:angular:tokens pnpm nx serve your-app
```

`analog:platform:tokens` covers config loading, builds, and watch-mode rebuilds.
`analog:angular:tokens` is reserved for future Angular-side token resource diagnostics as this pipeline expands.
