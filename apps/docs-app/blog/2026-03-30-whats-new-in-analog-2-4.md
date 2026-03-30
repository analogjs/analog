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

To upgrade, update your `vite` dependency in your `package.json`:

```json
{
  "devDependencies": {
    "vite": "^8.0.0"
  }
}
```

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

The easiest way to enable all serializers is via the automatic setup imports in your test setup file:

```typescript
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import '@analogjs/vitest-angular/setup-serializers';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed();
```

New projects created with `create-analog` include this by default. You can also register serializers individually if you need more control:

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

Analog 2.4 adds full support for Astro v6 via the new Vite Environment API. No configuration changes are required — just update your dependencies:

```json
{
  "dependencies": {
    "astro": "^6.0.0",
    "@analogjs/astro-angular": "^2.4.0"
  }
}
```

### `strictStylePlacement` Option

A new `strictStylePlacement` configuration option moves Angular component styles from the component body into the document `<head>`, producing valid HTML output:

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import angular from '@analogjs/astro-angular';

export default defineConfig({
  integrations: [angular({ strictStylePlacement: true })],
});
```

When enabled, Angular component styles are relocated to `<head>` regardless of which island they originate from. Style ordering is preserved across multiple islands, and styles inside `<template>` elements (shadow DOM) are left in place.

> **Note:** Enabling this option disables Astro's streaming mode under SSR.

## Upgrading

To upgrade to Analog 2.4, run:

```bash
ng update @analogjs/platform@latest
```

For the full list of changes, see the [changelog](https://github.com/analogjs/analog/blob/main/CHANGELOG.md).

## Partner with Analog 🤝

Continued development of Analog would not be possible without our partners and community. Thanks to our official deployment partner [Zerops](https://zerops.io) and longtime supporters [Snyder Technologies](https://snyder.tech/), [Nx](https://nx.dev), and [House of Angular](https://houseofangular.io), and many other backers of the project.

Find out more information on our [partnership opportunities](https://analogjs.org/docs/sponsoring#partnerships) or reach out directly to partnerships[at]analogjs.org.

## Join the Community 🥇

- Visit and Star the [GitHub Repo](https://github.com/analogjs/analog)
- Join the [Discord](https://chat.analogjs.org)
- Follow us on [Twitter](https://twitter.com/analogjs)

If you enjoyed this post, click the ❤️ so other people will see it. Follow [AnalogJS](https://twitter.com/analogjs) and [Brandon Roberts](https://twitter.com/brandontroberts) on Twitter/X, and subscribe to my [YouTube Channel](https://youtube.com/brandonrobertsdev?sub_confirmation=1) for more content!
