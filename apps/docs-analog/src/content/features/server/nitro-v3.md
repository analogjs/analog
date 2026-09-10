---
title: Nitro v3
---

# Nitro v3

Analog v3 uses Nitro `3.0.260903-beta`. Nitro v3 is prerelease software; pin its version when upgrading an existing application. Use Node.js 24.15 or later in the supported Node 24 or 26 release lines.

## Integration and bundling

The platform integration uses `nitro/vite` and requires Vite 7 or 8. Include the upstream `nitro()` plugin alongside `analog()` in your Vite configuration. The standalone `@analogjs/vite-plugin-nitro` integration retains the Vite 6–8 build paths. Keep your existing `analog()` options when switching integrations.

Nitro manages its SSR service graph in development, production, and prerendering. Rolldown is the default standalone server bundler. Explicit Nitro builder settings remain supported. Remove application workarounds that force Rollup, disable Nitro chunk splitting, externalize Angular/RxJS, or select the `self` development runner solely to compensate for older Nitro releases.

Nitro's dependency tracing and preset bundling should own server dependencies. Validate the generated deployment output independently of the source checkout, especially if you provide your own externals.

## Rendering rules

Configure `ssr` and `streaming` through Nitro `routeRules`. A more specific rule can re-enable either option. Analog reads the resolved server policy; incoming `x-analog-no-ssr` and `x-analog-no-streaming` headers do not control native rendering.

The native renderer preserves returned `Response` objects, including status, redirects, multiple cookies, and streaming bodies. Its request-local fetch forwards request headers to same-origin Nitro routes, while external requests receive only explicitly supplied headers. Cancellation follows the parent request.

Use `static: true` in Analog options for a prerendered site without a final server bundle. Prerendering still builds a temporary server in Nitro's build directory. Analog removes stale compressed root HTML, including `.zst`, before rendering the root page.

## Cache migration

Nitro's September release changes caching defaults. Review existing cache rules before deploying: query strings are ignored by default, cookies are stripped from cacheable requests by default, and stale-while-revalidate is disabled by default. Cached responses also strip `Set-Cookie`. Explicitly select query and header variation for each cacheable route. Avoid adding shared caches to personalized loaders without a deliberate cache-key policy.

Nitro v3 also removes the old auto-import and generated typed-fetch machinery. Import runtime helpers explicitly. See the [Nitro migration guide](https://nitro.build/docs/migration), [cache guide](https://nitro.build/docs/cache), and [H3 route rules](https://h3.dev/guide/rules) for the upstream configuration and behavior.

## Deployment and optional features

Explicit Nitro output directories take precedence over Analog's conventional Node layout. Cloudflare Workers and Cloudflare Pages use different deployment layouts; choose the appropriate Nitro preset rather than changing a Workers server directory to Pages' `_worker.js` directory.

Configure native capabilities directly through Nitro options: request tracing, virtual filesystem assets, compression, cache policies, and Cloudflare's local workerd runner. These are opt-in decisions for each application; Analog does not enable application-wide tracing or caching. See the [Cloudflare provider guide](https://nitro.build/deploy/providers/cloudflare) and the [September release notes](https://github.com/nitrojs/nitro/releases/tag/v3.0.260903-beta).

## Temporary development patches

This qualification branch applies exact-version pnpm patches for two upstream bugs:

- [h3js/srvx#302](https://github.com/h3js/srvx/issues/302): Zone.js replaces global Promise, causing repeated Node development requests to return empty 500s.
- [unjs/env-runner#46](https://github.com/unjs/env-runner/issues/46): Miniflare drops method, headers and body from Request inputs, affecting authentication and form submissions.

The patched workspace passes independent regression checks and local Cloudflare development/production conformance. These patches are not automatically shipped to applications through published Analog packages. Until fixed upstream releases are available, consumers must apply the exact-version patches in their own package-manager configuration. See `patches/README.md` in the qualification branch for configuration, tests, issue references and removal criteria.
