# Fixed-locale SSR integration

Exercises the automatic fixed-locale worker selection against a built Node server with Spanish and English workers.

```sh
# Nx Vite executor (legacy SSR build path), then HTTP checks
pnpm nx e2e i18n-workers-app --skipNxCache

# Vite CLI (Environment API build path), then the same HTTP checks
pnpm nx run i18n-workers-app:build-vite
pnpm nx e2e i18n-workers-app --excludeTaskDependencies --skipNxCache
```

The checks cover overlapping locale requests, concurrent requests within one locale, lazy templates, module-level and asynchronous `$localize`, server functions, request bodies, cookies, response streams, failure recovery, and graceful shutdown. They also verify 38 prerendered pages, concurrent rendering within each locale, crawled links, static responses from the hybrid server, and the absence of the Angular component-definition registry.

For a browser check, start `dist/apps/i18n-workers-app/analog/server/index.mjs`, open `/en` and `/es`, and click the counter. Each page should retain its language after hydration.

The fixture sets `i18n.loader` without an explicit Nitro preset or worker flag, so both build paths verify automatic selection. Use `i18n.workers: false` to opt out or `true` to require worker support.

Workers avoid per-request translation changes and template-cache resets. They add memory use, startup work, and a local HTTP forwarding step; this fixture verifies concurrency and correctness, not zero overhead. Prerendering runs through a temporary locale-worker pool and preserves Nitro concurrency and crawling. Runtime workers currently require the `node-server` preset and do not support progressive Angular streaming.
