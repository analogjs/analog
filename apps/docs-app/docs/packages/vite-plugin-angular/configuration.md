---
sidebar_position: 2
---

# Configuration

The `@analogjs/vite-plugin-angular` plugin provides extensive configuration options to customize your Angular development experience with Vite.

## Basic Configuration

```ts title="vite.config.ts - Basic Angular plugin configuration"
// vite.config.ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    angular({
      // Configuration options
    }),
  ],
});
```

## Configuration Options

### `tsconfig`

Specify a custom TypeScript configuration file path.

```ts title="Custom TypeScript configuration"
angular({
  tsconfig: './tsconfig.app.json',
});
```

````

**Default:** `'./tsconfig.json'`

### `workspaceRoot`

Define the workspace root directory.

```ts title="Custom workspace root"
angular({
  workspaceRoot: './projects/my-app'
})
````

````

**Default:** `process.cwd()`

### `inlineStylesExtension`

Set the file extension for inline styles in components.

```ts title="Custom inline styles extension"
angular({
  inlineStylesExtension: 'scss' // or 'sass', 'less', 'css'
})
````

````

**Default:** `'css'`

### `jit`

Enable Just-In-Time (JIT) compilation mode for development.

```ts title="Enable JIT compilation"
angular({
  jit: true
})
````

````

**Default:** `false`

**Note:** JIT mode is useful for development but should not be used in production.

### `transformFilter`

Custom filter function to determine which files should be transformed.

```ts title="Custom transform filter"
angular({
  transformFilter: (code: string, id: string) => {
    // Skip transformation for specific files
    if (id.includes('node_modules')) {
      return false;
    }
    return true;
  }
})
````

````

### `advanced`

Advanced optimization options for production builds.

```ts
angular({
  advanced: {
    // Advanced optimizations
  }
})
````

## Style Preprocessing

### SCSS/Sass Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    angular({
      inlineStylesExtension: 'scss',
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "src/styles/variables";`,
        includePaths: ['node_modules'],
      },
    },
  },
});
```

### Less Configuration

```ts
export default defineConfig({
  plugins: [
    angular({
      inlineStylesExtension: 'less',
    }),
  ],
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        additionalData: `@import "src/styles/variables.less";`,
      },
    },
  },
});
```

## TypeScript Configuration

### Multiple TypeScript Configs

For complex projects with different TypeScript configurations:

```ts
// Development configuration
export default defineConfig({
  plugins: [
    angular({
      tsconfig: './tsconfig.app.json',
    }),
  ],
});

// Test configuration
export default defineConfig({
  plugins: [
    angular({
      tsconfig: './tsconfig.spec.json',
    }),
  ],
});
```

### Strict Mode

Ensure your TypeScript configuration has proper strict settings:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "strictPropertyInitialization": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

## Environment-Specific Configuration

### Development vs Production

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    plugins: [
      angular({
        jit: isDev, // Use JIT in development only
        tsconfig: isDev ? './tsconfig.dev.json' : './tsconfig.json',
      }),
    ],
    build: {
      sourcemap: isDev,
      minify: !isDev,
    },
  };
});
```

### Environment Variables

```ts
// vite.config.ts
export default defineConfig({
  plugins: [angular()],
  define: {
    'import.meta.env.API_URL': JSON.stringify(process.env.API_URL),
    'import.meta.env.APP_VERSION': JSON.stringify(
      process.env.npm_package_version,
    ),
  },
});
```

## Optimization Options

### Build Optimizations

```ts
export default defineConfig({
  plugins: [
    angular({
      advanced: {
        // Coming soon: Advanced optimization options
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'angular-core': ['@angular/core', '@angular/common'],
          'angular-router': ['@angular/router'],
          'angular-forms': ['@angular/forms'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true,
  },
});
```

### Performance Optimizations

```ts
export default defineConfig({
  plugins: [angular()],
  optimizeDeps: {
    include: [
      '@angular/core',
      '@angular/common',
      '@angular/router',
      '@angular/forms',
    ],
    exclude: ['@angular/localize'],
  },
  server: {
    warmup: {
      clientFiles: ['./src/main.ts', './src/app/app.component.ts'],
    },
  },
});
```

## Integration with Other Vite Plugins

### PWA Support

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    angular(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'My Angular App',
        short_name: 'AngularApp',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
});
```

### Image Optimization

```ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import imagemin from 'vite-plugin-imagemin';

export default defineConfig({
  plugins: [
    angular(),
    imagemin({
      gifsicle: { optimizationLevel: 3 },
      optipng: { optimizationLevel: 7 },
      mozjpeg: { quality: 75 },
      svgo: {
        plugins: [
          { name: 'removeViewBox', active: false },
          { name: 'removeEmptyAttrs', active: false },
        ],
      },
    }),
  ],
});
```

## Troubleshooting Configuration Issues

### Common Issues

1. **TypeScript errors during build**

   - Ensure `tsconfig` path is correct
   - Check TypeScript version compatibility

2. **Styles not loading**

   - Verify `inlineStylesExtension` matches your files
   - Check CSS preprocessor configuration

3. **Memory issues**
   - Adjust Node.js memory: `NODE_OPTIONS='--max-old-space-size=4096'`

### Debug Mode

Enable detailed logging for troubleshooting:

```ts
export default defineConfig({
  plugins: [angular()],
  logLevel: 'info', // or 'warn', 'error', 'silent'
  clearScreen: false, // Keep logs visible
});
```

## Migration from Angular CLI

If migrating from Angular CLI, adjust your configuration:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [
    angular({
      tsconfig: './tsconfig.app.json', // Angular CLI default
      workspaceRoot: './', // Adjust if in monorepo
    }),
  ],
  root: './src', // Angular CLI structure
  publicDir: '../public',
  build: {
    outDir: '../dist',
  },
});
```

## Best Practices

1. **Keep configuration minimal** - Start with defaults and add options as needed
2. **Use environment-specific configs** - Separate dev and prod configurations
3. **Leverage TypeScript** - Use type-safe configuration files
4. **Monitor bundle size** - Use build analysis tools
5. **Test configuration changes** - Verify both dev and prod builds

## Related Documentation

- [Vite Configuration Reference](https://vitejs.dev/config/)
- [CSS Preprocessors Guide](/docs/packages/vite-plugin-angular/css-preprocessors)
- [Performance Optimization](/docs/guides/performance)
- [Troubleshooting Guide](/docs/guides/troubleshooting)
