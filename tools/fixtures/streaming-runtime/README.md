# Streaming runtime qualification

Run from the repository root after a normal dependency installation:

```sh
pnpm exec nx run platform:streaming-smoke --runtime=all --angular=all
```

Use `--runtime=node|node-zone|bun|workerd` and `--angular=21|22` to select a
case. The complete matrix requires Bun and the repository's Playwright Chromium
installation. CI pins Bun 1.4.2; Node follows `.node-version`.

The runner packs the actual platform, router, compiler plugin, and content
artifacts. It installs them into a fresh consumer, repeats a frozen installation,
and builds the consumer through Vite and Nitro. Angular 21 uses 21.0.0 with
Vite 7.0.0 and TypeScript 5.9.3. Angular 22 uses the workspace versions.

Node runs with native async context and separately with Zone.js. Bun and
Workerd run the zoneless fixture. Miniflare 4.20260730.0 supplies Workerd
1.20260730.1; its configuration comes from Nitro's generated Wrangler file.
All servers bind to loopback, and Miniflare's external `cf` metadata fetch is
disabled. No Cloudflare account or deployment is involved.

The slow resource is held behind a test release gate. Receiving the shell before
releasing that gate proves early delivery without a timing threshold. Other
checks cover deferred block/tail ordering, concurrent renders, buffered routes
and crawlers, error framing, module bootstrap only after completion, hydration
without rerunning the data source, and a truncated document after its preview
runtime has arrived.

For disconnect qualification, the test closes an actual HTTP socket while the
Angular resource remains pending. It does not manually invoke a Worker reader's
cancel method or abort the Worker's signal. The fixture observes platform
destruction and cooperative resource cancellation through its test-only API.
Prerender checks read useful complete HTML and the sitemap. The server entry
must remain outside the static asset directory.

Results under `dist/streaming-runtime/` include versions and hashes of the packed
framework artifacts, plus consumer lockfiles. Local Workerd qualification is not
a deployed Cloudflare environment or a complete hosting-preset matrix. Native
server-function dispatch remains Node-specific; the separate streaming example
tests server functions inside deferred hydration.

References: [Miniflare API](https://developers.cloudflare.com/workers/testing/miniflare/get-started/)
and [incoming request cancellation](https://developers.cloudflare.com/changelog/post/2025-05-22-handle-request-cancellation/).
