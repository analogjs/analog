---
sidebar_position: 4
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Migrating from Angular CLI to Analog

This comprehensive guide walks you through migrating an existing Angular application to Analog, covering automated migration, manual steps, common issues, and best practices.

## Overview

Migrating to Analog brings several benefits:

- ⚡ Faster development with Vite's HMR
- 🚀 Better build performance
- 📁 File-based routing
- 🔌 API routes support
- 🎯 Modern tooling with Vitest
- 📦 Optimized bundle sizes

> **Compatibility**: Analog supports Angular v15 and above. For older versions, upgrade Angular first.

## Using a Schematic/Generator

First, install the `@analogjs/platform` package:

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

Next, run the command to set up the Vite config, update the build/serve targets in the project configuration, move necessary files, and optionally set up Vitest for unit testing.

```shell
npx ng generate @analogjs/platform:migrate --project [your-project-name]
```

For Nx projects:

```shell
npx nx generate @analogjs/platform:migrate --project [your-project-name]
```

## Updating Global Styles and Scripts

If you have any global scripts or styles configured in the `angular.json`, reference them inside the `head` tag in the `index.html`.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My Analog app</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <app-root></app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## Setting Up Environments

In an Angular application, `fileReplacements` are configured in the `angular.json` for different environments.

### Using Environment Variables

In Analog, you can setup and use environment variables. This is the **recommended** approach.

Add a `.env` file to the root of your application, and prefix any **public** environment variables with `VITE_`. **Do not** check this file into your source code repository.

```sh
VITE_MY_API_KEY=development-key

# Only available in the server build
MY_SERVER_API_KEY=development-server-key
```

Import and use the environment variable in your code.

```ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiKey = import.meta.env['VITE_MY_API_KEY'];

  constructor(private http: HttpClient) {}
}
```

When deploying, set up your environment variables to their production equivalents.

```sh
VITE_MY_API_KEY=production-key

# Only available in the server build
MY_SERVER_API_KEY=production-server-key
```

Read [here](https://vitejs.dev/guide/env-and-mode.html) for about more information on environment variables.

### Using File Replacements

You can also use the `replaceFiles()` plugin from Nx to replace files during your build.

Import the plugin and set it up:

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import { replaceFiles } from '@nx/vite/plugins/rollup-replace-files.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    target: ['es2020'],
  },
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    analog(),
    mode === 'production' &&
      replaceFiles([
        {
          replace: './src/environments/environment.ts',
          with: './src/environments/environment.prod.ts',
        },
      ]),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
```

Add the environment files to `files` array in the `tsconfig.app.json` may also be necessary.

```json
{
  "extends": "./tsconfig.json",
  // other config
  "files": [
    "src/main.ts",
    "src/main.server.ts",
    "src/environments/environment.prod.ts"
  ]
}
```

## Copying Assets

Static assets in the `public` directory are copied to the build output directory by default. If you want to copy additional assets outside of that directory, use the `nxCopyAssetsPlugin` Vite plugin.

Import the plugin and set it up:

```ts
/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ...
  plugins: [analog(), nxCopyAssetsPlugin(['*.md'])],
}));
```

## Migration Checklist

Use this checklist to ensure a complete migration:

### Pre-Migration

- [ ] Ensure Angular version is v15 or higher
- [ ] Back up your project
- [ ] Commit all changes to version control
- [ ] Document any custom webpack configurations

### Core Migration

- [ ] Run the migration schematic
- [ ] Update project configuration files
- [ ] Configure Vite settings
- [ ] Set up TypeScript paths
- [ ] Move and update assets

### Routing Migration

- [ ] Convert routes to file-based routing
- [ ] Update lazy-loaded modules
- [ ] Migrate route guards
- [ ] Update route parameters usage

### Build & Development

- [ ] Test development server
- [ ] Verify HMR is working
- [ ] Build for production
- [ ] Test production build locally

### Testing

- [ ] Migrate to Vitest (if applicable)
- [ ] Update test configurations
- [ ] Run all unit tests
- [ ] Run e2e tests

## Common Migration Patterns

### Converting Module-Based Routes to File-Based

**Before (Angular CLI):**

```ts
// app-routing.module.ts
const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'about', component: AboutComponent },
  {
    path: 'products',
    loadChildren: () =>
      import('./products/products.module').then((m) => m.ProductsModule),
  },
];
```

**After (Analog):**

```
src/app/pages/
├── (home).page.ts       // maps to '/'
├── about.page.ts        // maps to '/about'
└── products/            // lazy-loaded route group
    ├── index.page.ts    // maps to '/products'
    └── [id].page.ts     // maps to '/products/:id'
```

### Converting Services and Providers

**Before:**

```ts
// app.module.ts
@NgModule({
  providers: [
    { provide: API_URL, useValue: environment.apiUrl },
    AuthService,
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
  ],
})
export class AppModule {}
```

**After:**

```ts
// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    { provide: API_URL, useValue: environment.apiUrl },
    AuthService,
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
```

### Environment Variables

**Before:**

```ts
// environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
};
```

**After:**

```ts
// Use Vite env variables
// .env.development
VITE_API_URL=http://localhost:3000

// In code
const apiUrl = import.meta.env.VITE_API_URL;
```

## Troubleshooting Migration Issues

### Module Resolution Errors

**Problem:** `Cannot find module` errors after migration

**Solution:**

1. Check TypeScript paths in `tsconfig.json`:

   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"],
         "@app/*": ["./src/app/*"]
       }
     }
   }
   ```

2. Update imports to use path aliases:

   ```ts
   // Before
   import { UserService } from '../../../services/user.service';

   // After
   import { UserService } from '@app/services/user.service';
   ```

### Asset Loading Issues

**Problem:** Images and assets not loading

**Solution:**

1. Move assets from `src/assets` to `public` directory
2. Update asset references:

   ```html
   <!-- Before -->
   <img src="assets/logo.png" />

   <!-- After -->
   <img src="/logo.png" />
   ```

### Styling Issues

**Problem:** Global styles not applied

**Solution:**

1. Import global styles in `main.ts`:

   ```ts
   import './styles.css';
   ```

2. For SCSS, update `vite.config.ts`:
   ```ts
   export default defineConfig({
     css: {
       preprocessorOptions: {
         scss: {
           additionalData: `@import "src/styles/variables";`,
         },
       },
     },
   });
   ```

### Build Errors

**Problem:** Build fails with `window is not defined`

**Solution:**
For SSR compatibility, wrap browser-only code:

```ts
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';

export class MyComponent {
  private platformId = inject(PLATFORM_ID);

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Browser-only code
      window.localStorage.setItem('key', 'value');
    }
  }
}
```

## Performance Optimization After Migration

### 1. Leverage Vite's Features

```ts
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['@angular/core', '@angular/common'],
          ui: ['@angular/material', '@angular/cdk'],
        },
      },
    },
  },
});
```

### 2. Optimize Bundle Size

Remove unused imports and dead code:

```bash
# Analyze bundle
npm run build -- --analyze
```

### 3. Enable Compression

```ts
// vite.config.ts
import compression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    angular(),
    compression({
      algorithm: 'brotliCompress',
    }),
  ],
});
```

## Best Practices Post-Migration

1. **Adopt File-Based Routing**: Gradually convert traditional routes to file-based routes
2. **Use API Routes**: Move backend logic to API routes instead of external services
3. **Leverage HMR**: Take advantage of Vite's fast refresh for better DX
4. **Optimize Assets**: Use Vite's asset handling for images and static files
5. **Modern Testing**: Migrate tests to Vitest for faster execution
6. **Type Safety**: Use TypeScript strict mode for better type checking

## Resources and Support

- [Analog Discord Community](https://chat.analogjs.org)
- [GitHub Issues](https://github.com/analogjs/analog/issues)
- [Migration Examples](https://github.com/analogjs/analog/tree/main/examples)
- [Vite Documentation](https://vitejs.dev)

## Next Steps

Your migration to Analog is complete! Explore these features to get the most out of Analog:

1. 📁 [File-based routing](/docs/features/routing/overview) - Simplify your routing
2. 🔌 [API routes](/docs/features/api/overview) - Build fullstack applications
3. 📝 [Content routes](/docs/features/routing/content) - Add markdown support
4. 🚀 [Deployment](/docs/features/deployment/overview) - Deploy to production
5. ⚡ [Performance optimization](/docs/guides/performance) - Make your app faster
