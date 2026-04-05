---
title: Deprecations and Compatibility
---

# Deprecations and Compatibility

This page is the canonical deprecation audit for the current Analog v3 prerelease line.

The goal is to keep the public surface explicit:

- deprecated APIs stay usable only when they still protect existing projects from avoidable churn
- new docs and examples should prefer the non-deprecated API
- removals should be grouped into a major release after the migration path is already documented

## Current public deprecations

| Package | Deprecated API | Prefer instead | Current posture |
| ------- | -------------- | -------------- | --------------- |
| `@analogjs/router` | `defineRouteMeta()` | typed `RouteMeta` object literals | Keep exported for compatibility, but prefer `RouteMeta` in docs and new code. |
| `@analogjs/vite-plugin-nitro` | `useAPIMiddleware` | filesystem API routes in `src/server/routes/api` | Keep only as a compatibility option for older project layouts. |
| `@analogjs/platform` | `useAPIMiddleware` | filesystem API routes in `src/server/routes/api` | Same deprecation posture as Nitro because the platform option is just a passthrough. |
| `@analogjs/trpc` | `tRPCClient` | `TrpcClient` | Keep as a compatibility alias until the next major. |
| `@analogjs/trpc` | `provideTRPCClient` | `provideTrpcClient` | Keep as a compatibility alias until the next major. |
| `@analogjs/trpc` | `tRPCHeaders` | `TrpcHeaders` | Keep as a compatibility alias until the next major. |
| `@analogjs/trpc` | `ClientDataTransformerOptions` in the optional transformer union | `CombinedDataTransformer` | Keep for compatibility while the current client options shape remains supported. |

## Upgrade guidance

### Route metadata

Prefer this:

```ts
import type { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  title: 'Products',
};
```

Instead of wrapping the same object in `defineRouteMeta(...)`.

### API routes

Prefer file-based API routes under `src/server/routes/api/**`.

`useAPIMiddleware` remains available so older projects do not have to move server files and runtime wiring in the same upgrade, but new setups should not depend on it.

### tRPC client aliases

Prefer the camel-cased exports:

- `TrpcClient`
- `provideTrpcClient`
- `TrpcHeaders`

The older `tRPC*` names remain as compatibility aliases only.

## Next-major removal plan

A deprecated API should be removed only when all of the following are true:

1. The replacement is already the default in docs, examples, and generated code.
2. The replacement has a straightforward migration path.
3. The removal does not force unrelated refactors during a normal version upgrade.

By that standard, the `tRPC*` aliases, `defineRouteMeta()`, and `useAPIMiddleware` are all reasonable next-major cleanup candidates once the current compatibility window is no longer needed.
