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

To upgrade, update your `vite` dependency to `^8.0.0` in your `package.json`.

## Vitest Angular: Testing DX Improvements

### Reusable Snapshot Serializers

Writing snapshot tests for Angular components often produces noisy output filled with framework internals like `_ngcontent-*`, `_nghost-*`, `ng-reflect-*` attributes, and `<!--container-->` comments. Analog 2.4 introduces three built-in snapshot serializers that clean this up:

- **`createAngularFixtureSnapshotSerializer`** — Serializes Angular component fixtures into clean component markup (e.g. `<app-card>...</app-card>`) instead of raw testing internals.
- **`createNoNgAttributesSnapshotSerializer`** — Strips Angular runtime noise from DOM snapshots, including generated attributes, classes, IDs, and ARIA attributes.
- **`createHtmlCommentSnapshotSerializer`** — Removes Angular-generated HTML comments like `<!--container-->`.

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

New projects created with `create-analog` include these by default.

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

Analog 2.4 adds full support for Astro v6 by implementing the new Vite Environment API. The integration now properly defines `ngServerMode` for the client environment, ensuring Angular components render correctly in Astro islands.

### `strictStylePlacement` Option

A new `strictStylePlacement` configuration option moves Angular component styles from the component body into the document `<head>`, producing valid HTML output:

```javascript
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular({ strictStylePlacement: true })],
});
```

When enabled, a middleware processes the HTML response, finds all `<style ng-app-id="...">` tags, and relocates them to the `<head>`. Style ordering is preserved across multiple Angular islands on the same page.

> **Note:** Enabling this option disables Astro's streaming mode under SSR.

## Upgrading

To upgrade to Analog 2.4, run:

```bash
npm install @analogjs/platform@latest @analogjs/vitest-angular@latest
```

For the full list of changes, see the [changelog](https://github.com/analogjs/analog/blob/main/CHANGELOG.md).
