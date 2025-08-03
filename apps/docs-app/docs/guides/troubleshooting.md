---
sidebar_position: 5
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Troubleshooting Guide

This guide covers common issues you might encounter when working with Analog and their solutions.

## Installation Issues

### Node Version Errors

**Problem:** Error during installation saying "The engine 'node' is incompatible"

```bash
error @analogjs/platform@0.2.0: The engine "node" is incompatible with this module.
```

**Solution:**
Ensure you have Node.js v18.13.0 or higher:

```bash
# Check your Node version
node --version

# If needed, upgrade Node using nvm
nvm install 18
nvm use 18

# Or download from nodejs.org
```

### Package Manager Conflicts

**Problem:** Installation fails with dependency resolution errors

**Solution:**
Clear your package manager cache and lock files:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```bash
rm -rf node_modules yarn.lock
yarn cache clean
yarn install
```

  </TabItem>

  <TabItem value="pnpm">

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm store prune
pnpm install
```

  </TabItem>

  <TabItem value="bun">

```bash
rm -rf node_modules bun.lockb
bun install
```

  </TabItem>
</Tabs>

### Permission Errors

**Problem:** EACCES or permission denied errors during installation

**Solution:**
Avoid using sudo with npm. Instead, configure npm to use a different directory:

```bash
# Configure npm to use a different directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

## Development Server Issues

### Port Already in Use

**Problem:** Error: "Port 5173 is already in use"

**Solution:**

```bash
# Option 1: Use a different port
npm run dev -- --port 3000

# Option 2: Kill the process using the port
# On macOS/Linux:
lsof -ti:5173 | xargs kill -9

# On Windows:
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### Hot Module Replacement (HMR) Not Working

**Problem:** Changes aren't reflected in the browser

**Solutions:**

1. **Check file watching limits (Linux):**

   ```bash
   # Increase file watching limit
   echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p
   ```

2. **Disable antivirus scanning** on your project directory

3. **Use polling mode** in Vite config:
   ```ts
   // vite.config.ts
   export default defineConfig({
     server: {
       watch: {
         usePolling: true,
       },
     },
   });
   ```

### Module Resolution Errors

**Problem:** Cannot find module errors in the browser

```
Error: Cannot find module '@angular/core'
```

**Solutions:**

1. **Ensure dependencies are installed:**

   ```bash
   npm install
   ```

2. **Check TypeScript paths in tsconfig.json:**

   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"]
       }
     }
   }
   ```

3. **Clear Vite cache:**
   ```bash
   rm -rf node_modules/.vite
   npm run dev
   ```

## Routing Issues

### 404 Errors for Routes

**Problem:** Routes return 404 errors

**Solutions:**

1. **Check file naming convention:**

   ```
   src/app/pages/
   ├── index.page.ts        ✓ Correct
   ├── about.page.ts        ✓ Correct
   ├── about.ts             ✗ Wrong (missing .page)
   └── About.page.ts        ✗ Wrong (should be lowercase)
   ```

2. **Verify route configuration:**

   ```ts
   // app.config.ts
   import { provideFileRouter } from '@analogjs/router';

   export const appConfig: ApplicationConfig = {
     providers: [provideFileRouter()],
   };
   ```

### Dynamic Routes Not Working

**Problem:** Dynamic routes like `/users/[id]` return 404

**Solution:**
Ensure proper file naming:

```
pages/
└── users/
    └── [id].page.ts     ✓ Correct
    └── :id.page.ts      ✗ Wrong syntax
```

### Route Parameters Not Available

**Problem:** Can't access route parameters in components

**Solution:**
Use the correct injection token:

```ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  template: `User ID: {{ userId() }}`,
})
export default class UserPage {
  route = inject(ActivatedRoute);
  userId = this.route.snapshot.params['id'];
}
```

## Build Errors

### TypeScript Compilation Errors

**Problem:** Build fails with TypeScript errors

**Solutions:**

1. **Check TypeScript version compatibility:**

   ```bash
   npm ls typescript
   ```

2. **Enable skipLibCheck temporarily:**

   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "skipLibCheck": true
     }
   }
   ```

3. **Clear TypeScript cache:**
   ```bash
   rm -rf dist
   npx tsc --build --clean
   ```

### Memory Errors During Build

**Problem:** "JavaScript heap out of memory" error

**Solution:**
Increase Node.js memory limit:

```bash
# Increase to 4GB
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build

# Or in package.json
"scripts": {
  "build": "NODE_OPTIONS='--max-old-space-size=4096' ng build"
}
```

### SSR Build Failures

**Problem:** Server-side rendering build fails

**Solutions:**

1. **Check for browser-only APIs:**

   ```ts
   // Wrap browser-only code
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

2. **Mock browser globals for SSR:**
   ```ts
   // main.server.ts
   (global as any).window = {};
   (global as any).document = {};
   ```

## API Route Issues

### API Routes Return 404

**Problem:** API endpoints not accessible

**Solutions:**

1. **Check file location:**

   ```
   src/server/routes/api/
   └── hello.ts          → /api/hello ✓

   src/api/
   └── hello.ts          → Not recognized ✗
   ```

2. **Verify Nitro configuration:**

   ```ts
   // vite.config.ts
   import { defineConfig } from 'vite';
   import nitro from '@analogjs/vite-plugin-nitro';

   export default defineConfig({
     plugins: [nitro()],
   });
   ```

### CORS Errors

**Problem:** CORS policy blocking API requests

**Solution:**
Add CORS middleware:

```ts
// src/server/middleware/cors.ts
import { defineEventHandler, handleCors } from 'h3';

export default defineEventHandler(async (event) => {
  handleCors(event, {
    origin: '*',
    credentials: true,
    methods: '*',
  });
});
```

## Content/Markdown Issues

### Markdown Files Not Rendering

**Problem:** Markdown content shows as plain text

**Solution:**
Install and configure content plugin:

```bash
npm install @analogjs/content
```

```ts
// vite.config.ts
import content from '@analogjs/content';

export default defineConfig({
  plugins: [
    analog({
      content: {
        highlighter: 'shiki',
      },
    }),
  ],
});
```

### Frontmatter Not Working

**Problem:** Frontmatter data not available in markdown files

**Solution:**
Use the correct import syntax:

```ts
// ✓ Correct
import { injectContent, MarkdownComponent } from '@analogjs/content';

// Component
export default class BlogPost {
  content = injectContent();
  // Access frontmatter
  attributes = this.content.attributes;
}
```

## Performance Issues

### Slow Initial Load

**Problem:** Application takes too long to load

**Solutions:**

1. **Enable production mode:**

   ```bash
   npm run build
   npm run serve
   ```

2. **Lazy load routes:**

   ```ts
   // Use dynamic imports
   const routes = [
     {
       path: 'admin',
       loadComponent: () => import('./admin/admin.page'),
     },
   ];
   ```

3. **Optimize bundle size:**
   ```bash
   # Analyze bundle
   npm run build -- --analyze
   ```

### Memory Leaks

**Problem:** Application becomes slower over time

**Solution:**
Properly clean up subscriptions:

```ts
import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export class MyComponent {
  destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.myObservable$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }
}
```

## Testing Issues

### Vitest Configuration Errors

**Problem:** Tests fail to run with Vitest

**Solution:**
Ensure proper Vitest configuration:

```ts
// vite.config.ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig({
  plugins: [analog()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
  },
});
```

### Component Testing Failures

**Problem:** Component tests fail with "Cannot find module" errors

**Solution:**
Configure module resolution for tests:

```ts
// src/test-setup.ts
import '@analogjs/vite-plugin-angular/setup-vitest';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);
```

## Common Error Messages

### "Cannot find module '@analogjs/router'"

**Solution:**

```bash
npm install @analogjs/router
```

### "ReferenceError: window is not defined"

**Solution:**
This occurs during SSR. Wrap browser-specific code:

```ts
if (typeof window !== 'undefined') {
  // Browser-only code
}
```

### "Error: No provider for ActivatedRoute!"

**Solution:**
Ensure routing is properly configured:

```ts
// In tests
import { RouterTestingModule } from '@angular/router/testing';

TestBed.configureTestingModule({
  imports: [RouterTestingModule],
});
```

## Getting Help

If you're still experiencing issues:

1. **Check the documentation**: Make sure you've followed all setup steps
2. **Search existing issues**: [GitHub Issues](https://github.com/analogjs/analog/issues)
3. **Join the community**: [Discord Server](https://chat.analogjs.org)
4. **Create a minimal reproduction**: Use [StackBlitz](https://stackblitz.com) to demonstrate the issue
5. **File a bug report**: Include all relevant details and reproduction steps

### Debugging Tips

1. **Enable verbose logging:**

   ```bash
   DEBUG=* npm run dev
   ```

2. **Check browser console** for client-side errors

3. **Check terminal output** for server-side errors

4. **Use VS Code debugger:**
   ```json
   // .vscode/launch.json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "node",
         "request": "launch",
         "name": "Debug Analog",
         "runtimeExecutable": "npm",
         "runtimeArgs": ["run", "dev"],
         "console": "integratedTerminal"
       }
     ]
   }
   ```
