# Fixed-locale SSR integration

Exercises the experimental `i18n.workers` option against a built Node server with Spanish and English workers.

```sh
# Nx Vite executor (legacy SSR build path), then HTTP checks
pnpm nx e2e i18n-workers-app --skipNxCache

# Vite CLI (Environment API build path), then the same HTTP checks
pnpm nx run i18n-workers-app:build-vite
pnpm nx e2e i18n-workers-app --excludeTaskDependencies --skipNxCache
```

The checks cover overlapping locale requests, concurrent requests within one locale, lazy templates, module-level and asynchronous `$localize`, server functions, request bodies, cookies, response streams, failure recovery, and graceful shutdown. They also verify that the Angular component-definition registry is absent.

For a browser check, start `dist/apps/i18n-workers-app/analog/server/index.mjs`, open `/en` and `/es`, and click the counter. Each page should retain its language after hydration.

Workers avoid per-request translation changes and template-cache resets. They add memory use, startup work, and a local HTTP forwarding step; this fixture verifies concurrency and correctness, not zero overhead. This option currently requires the `node-server` preset and does not support prerendering or progressive Angular streaming.
