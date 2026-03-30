---
title: What's new in Analog 2.4?
slug: 2026-03-30-whats-new-in-analog-2-4
description: Analog 2.4 ships with Vite 8 support, improved testing DX with snapshot serializers and teardown options, and updated Astro Angular integration with Astro v6 support and strict style placement.
---

We are excited to announce the release of Analog 2.4! This release brings Vite 8 support, significant testing improvements for Vitest Angular, and an updated Astro Angular integration. Let's dive in.

## Vite 8 Support

Analog 2.4 updates to the stable release of Vite 8.0.0. This is a major ecosystem alignment that brings several benefits:

- **Rolldown bundler**: Vite 8 introduces Rolldown, a Rust-based bundler, as an alternative to esbuild for optimization. Analog's Angular Vite plugin now detects Rolldown availability and uses OXC-based compilation when available.
- **Vite Environment API**: Analog leverages the new Environment API for managing client and server configurations, particularly in the Astro Angular integration.
- **Backward compatibility**: The content plugin continues to support Vite 5 through 8, so you can upgrade at your own pace.

Under the hood, the Angular Vite plugin detects Rolldown and switches between OXC and esbuild automatically:

```typescript
return {
  ...(vite.rolldownVersion ? { oxc } : { esbuild }),
  optimizeDeps: {
    include: ['rxjs/operators', 'rxjs'],
    exclude: ['@angular/platform-server'],
    ...(vite.rolldownVersion
      ? { rolldownOptions }
      : { esbuildOptions }),
  },
};
```

When Rolldown is present, a dedicated compiler plugin handles Angular's JIT compilation during dependency optimization:

```typescript
export function createRolldownCompilerPlugin(
  pluginOptions: CompilerPluginOptions,
): Rolldown.Plugin {
  const javascriptTransformer = new JavaScriptTransformer(
    { ...pluginOptions, jit: true },
    1,
  );
  return {
    name: 'analogjs-rolldown-deps-optimizer-plugin',
    load: {
      filter: { id: /\.[cm]?js$/ },
      async handler(id) {
        const contents = await javascriptTransformer.transformFile(id);
        return { code: Buffer.from(contents).toString('utf-8') };
      },
    },
  };
}
```

To upgrade, update your `vite` dependency to `^8.0.0` in your `package.json`.

## Vitest Angular: Testing DX Improvements

### Reusable Snapshot Serializers

Writing snapshot tests for Angular components often produces noisy output filled with framework internals like `_ngcontent-*`, `_nghost-*`, `ng-reflect-*` attributes, and `<!--container-->` comments. Analog 2.4 introduces three built-in snapshot serializers that clean this up.

**`createNoNgAttributesSnapshotSerializer`** strips Angular runtime noise from DOM snapshots. Here's what that looks like in practice:

```html
<!-- Before -->
<div id="root0" ng-version="21.1.3" _nghost-a-c1="" class="card ng-star-inserted keep-me">
  <span class="card ng-star-inserted" _ngcontent-a-c1="" ng-reflect-foo="bar">Title</span>
</div>

<!-- After -->
<div class="card keep-me">
  <span class="card">Title</span>
</div>
```

**`createAngularFixtureSnapshotSerializer`** converts `ComponentFixture` objects into clean component markup, so instead of seeing raw testing internals you get:

```html
<app-chip>
  <h1>
    Hello [Input Signal: Alice]
  </h1>
</app-chip>
```

**`createHtmlCommentSnapshotSerializer`** removes Angular-generated HTML comments like `<!--container-->`.

You can register them individually:

```typescript
import {
  createAngularFixtureSnapshotSerializer,
  createNoNgAttributesSnapshotSerializer,
  createHtmlCommentSnapshotSerializer,
} from '@analogjs/vitest-angular/snapshot-serializers';

expect.addSnapshotSerializer(createAngularFixtureSnapshotSerializer());
expect.addSnapshotSerializer(createNoNgAttributesSnapshotSerializer());
expect.addSnapshotSerializer(createHtmlCommentSnapshotSerializer());
```

Or use the automatic setup imports in your test setup file:

```typescript
import '@analogjs/vitest-angular/setup-snapshots';
import '@analogjs/vitest-angular/setup-serializers';
```

New projects created with `create-analog` scaffold the full test setup by default:

```typescript
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import '@analogjs/vitest-angular/setup-serializers';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed();
```

### `teardown.destroyAfterEach` Option

The new `teardown` option on `setupTestBed` gives you explicit control over Angular TestBed cleanup behavior:

```typescript
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed({
  teardown: { destroyAfterEach: false },
});
```

This replaces the `browserMode` option, which is now deprecated and will be removed in v3.0.0.

## Astro Angular: Astro v6 Support & Strict Style Placement

### Astro v6 Compatibility

Analog 2.4 adds full support for Astro v6 by implementing the new Vite Environment API. The integration uses the `configEnvironment` hook to properly define `ngServerMode` for the client environment:

```typescript
{
  name: 'analogjs-astro-client-ngservermode',
  configEnvironment(name: string) {
    if (name === 'client') {
      return {
        define: {
          ngServerMode: 'false',
        },
      };
    }
    return undefined;
  },
}
```

This ensures Angular components render correctly in Astro islands under Astro v6's new environment model.

### `strictStylePlacement` Option

A new `strictStylePlacement` configuration option moves Angular component styles from the component body into the document `<head>`, producing valid HTML output:

```javascript
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular({ strictStylePlacement: true })],
});
```

When enabled, a middleware processes the HTML response, finds all `<style ng-app-id="...">` tags, and relocates them to the `<head>`. For example, given multiple Angular islands:

```html
<!-- Before -->
<html>
  <body>
    <astro-island>
      <style ng-app-id="ng">/* component-1 styles */</style>
      <app-card>...</app-card>
    </astro-island>
    <astro-island>
      <style ng-app-id="ng">/* component-2 styles */</style>
      <app-hero>...</app-hero>
    </astro-island>
  </body>
</html>

<!-- After -->
<html>
  <head>
    <style ng-app-id="ng">/* component-1 styles */</style>
    <style ng-app-id="ng">/* component-2 styles */</style>
  </head>
  <body>
    <astro-island>
      <app-card>...</app-card>
    </astro-island>
    <astro-island>
      <app-hero>...</app-hero>
    </astro-island>
  </body>
</html>
```

Style ordering is preserved across multiple islands, and styles inside `<template>` elements (shadow DOM) are left in place.

> **Note:** Enabling this option disables Astro's streaming mode under SSR.

## Upgrading

To upgrade to Analog 2.4, run:

```bash
npm install @analogjs/platform@latest @analogjs/vitest-angular@latest
```

For the full list of changes, see the [changelog](https://github.com/analogjs/analog/blob/main/CHANGELOG.md).
