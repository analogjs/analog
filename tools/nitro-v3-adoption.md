# Nitro v3 adoption — September 7, 2026

## Baseline and scope

Branch: `feat/nitro-v3-optimization`, in the dedicated `.worktrees/nitro-v3-optimization` worktree. Base: upstream `analogjs/alpha` at `4225f45090a4cf4bdfb562a788e908787b6ec73c` (`3.0.0-alpha.86`). The original checkout and peer worktrees were not changed.

The latest upstream alpha **already pins Nitro `3.0.260903-beta`**. This change completes integration work around that release; it does not invent a newer Nitro version. The September 3 release is the newest v3 release returned by GitHub on September 7.

## 2026 release review

| Release                                                                             | Relevant changes                                                                                                                                    | Analog response                                                                                                                            |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [January 21: alpha.2](https://github.com/nitrojs/nitro/releases/tag/v3.0.1-alpha.2) | Rolldown server bundling and dependency-tracing controls                                                                                            | Remove the default Rollup override and hand dependency ownership back to Nitro.                                                            |
| [March 11](https://github.com/nitrojs/nitro/releases/tag/v3.0.260311-beta)          | Environment runners, ocache, Zstandard output                                                                                                       | Preserve explicit runner selection; clean stale `.zst` root HTML as well as gzip/Brotli.                                                   |
| [April 15](https://github.com/nitrojs/nitro/releases/tag/v3.0.260415-beta)          | Tracing, dependency tracing, cache invalidation; removed `moduleSideEffects` option                                                                 | Retain native bundler configuration rather than removing chunk options.                                                                    |
| [April 29](https://github.com/nitrojs/nitro/releases/tag/v3.0.260429-beta)          | Redirect/proxy security fixes                                                                                                                       | Keep upstream routing ownership.                                                                                                           |
| [May 22](https://github.com/nitrojs/nitro/releases/tag/v3.0.260522-beta)            | VFS assets, asset routing, tracing                                                                                                                  | Keep public-assets integration; expose these through upstream Nitro options.                                                               |
| [June 3](https://github.com/nitrojs/nitro/releases/tag/v3.0.260603-beta)            | Framework commands and default preset support                                                                                                       | Identify the framework and preserve explicit deployment layouts.                                                                           |
| [June 10](https://github.com/nitrojs/nitro/releases/tag/v3.0.260610-beta)           | Shared service virtuals and isolated prerendering                                                                                                   | Use `fetchViteEnv` throughout; remove guessed SSR-file discovery.                                                                          |
| [September 3](https://github.com/nitrojs/nitro/releases/tag/v3.0.260903-beta)       | H3 route rules, ocache 0.3 defaults, local workerd, runtime dependency resolution, static server-build skip, removal of old generated imports/types | Canonical rules, trusted rendering policy, request/response conformance, static isolation, deployment portability, and migration guidance. |

The installed release resolves H3 `2.0.1-rc.31`, srvx `1.0.3`, and env-runner `0.2.1`. Vite is updated to `8.2.2` and Rolldown to `1.2.7`; Nitro remains exactly pinned. Node's minimum is corrected to 24.15.0, including an `.nvmrc` link for Nx Agents. [Nx's install step reads `.nvmrc`](https://github.com/nrwl/nx-cloud-workflows/blob/v5/workflow-steps/install-node/main.js), not `.node-version` directly.

## Implementation

- Native development, production, and prerender dispatch use Nitro's shared service graph. Remove the unconditional `self` runner, filesystem entry scanning, runtime-external lists, and chunk-option deletion.
- Standalone development and production default to Rolldown, preserve explicit builder settings, and close development workers/watchers when Vite closes. Resolve the project root independently of the caller's working directory.
- Build the standalone SSR rule matcher once using H3's canonical matcher. Honor methods, base paths, decoded paths, and specific overrides. Both renderers read trusted server rules; specific rules can re-enable SSR or streaming.
- The native renderer preserves returned Responses, status, redirects, multiple cookies, streams, and cancellation. Same-origin request-local fetch inherits filtered request headers; cross-origin fetch does not inherit credentials.
- Delegate Node request/response adaptation to srvx. GET and HEAD page endpoints invoke loaders; HEAD must not invoke actions.
- Keep the nested prerender server dynamic and in the build directory even for static output or custom server directories. Preserve explicit output overrides and distinguish Workers from Pages. Normalize Windows output paths instead of writing every skipped prerender route.
- Resolve generated ofetch imports from the owning package. Declare standalone runtime dependencies and Vite peers so a strict, packed consumer does not rely on workspace hoisting.
- Add a reusable `platform:nitro-conformance` target, HTTP streaming/cancellation tests, route-policy regressions, and a Linux/Windows conformance workflow.

Retained compatibility code includes Angular linking/server transforms, the virtual renderer handoff during prerender initialization, the public-assets/prerender bridge, legacy Vite build paths, and standalone `es-toolkit`/Windows `std-env` handling. Removing these requires additional evidence. No application-wide cache or tracing policy is enabled.

## Validation

All commands use Node 24.15.0 and pnpm 10.33.0. Nx commands use `NX_DAEMON=false NX_NO_CLOUD=true`.

| Check                                                                  | Result                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install, including prepare/artifact verification                | Passed.                                                                                                                                                                                                                                                                                                           |
| `pnpm nx run-many --target build --all`                                | Passed twice for 23 projects plus 8 dependent tasks, including the final implementation.                                                                                                                                                                                                                          |
| `pnpm nx run-many --target test --projects platform,vite-plugin-nitro` | Passed: platform 394 tests; standalone 102 passed and 6 skipped.                                                                                                                                                                                                                                                  |
| `pnpm nx run platform:nitro-conformance`                               | Both paths passed development, production, and static checks: assets, page endpoints, HEAD, trusted rules, response metadata/cookies, and production session isolation. Native development session isolation also passed.                                                                                         |
| Strict packed consumer outside the workspace                           | Native and standalone paths passed on Vite 7.3.6 and 8.2.2; standalone passed on Vite 6.4.3. Each exercised development, server builds/preview, and static builds. Native Vite 6 is not supported by Nitro.                                                                                                       |
| Portable real Angular blog                                             | Copied the deployment output outside the checkout. `/about` returned 200 on three fresh starts. After removing the copied prerendered `/about` HTML, two successive dynamic Angular SSR requests also returned 200. Chromium E2E: 4 passed, 1 existing skip; checks included navigation, posts, RSS, and sitemap. |
| Direct Vite real Angular development                                   | First server-side render passed; repeated renders fail because of the srvx/Zone.js issue below. Development browser hydration is not qualified.                                                                                                                                                                   |
| Cloudflare production fixture                                          | Built the Workers preset and ran it locally with Wrangler 4.127.1, compatibility date 2026-09-03. Response metadata, assets, and concurrent cookies passed. This is a small renderer fixture, not a deployed Angular app.                                                                                         |
| Cloudflare development fixture                                         | Basic rendering/metadata/assets passed, but Request headers/method/body are lost at the Miniflare runner boundary. See the upstream issue below.                                                                                                                                                                  |
| Formatting                                                             | `pnpm nx format:check --base=HEAD`, Prettier on all changed/new formatted files, and `git diff --check` passed.                                                                                                                                                                                                   |
| Windows                                                                | Workflow added; no Windows execution or remote CI result is claimed.                                                                                                                                                                                                                                              |

Repository-wide gates are not all green:

- `pnpm nx run-many --target test --all`: `my-package:test` needs a display for its headed browser; `docs-analog:test` has five suites failing with `SyntaxError: Invalid or unexpected token`. Other project targets passed.
- `pnpm nx run-many --target lint --all`: content and router cannot load `plugin:@angular-eslint/recommended`. The changed platform and standalone packages passed lint.
- `pnpm nx run-many --target typecheck --all`: 11 of 23 project targets fail. Targeted platform/standalone typechecks already failed before implementation. Final targeted errors remain in untouched debug declarations, server-function plugin declaration inference, content/i18n types, and plugin type compatibility; no diagnostics name the changed Nitro implementation files.
- Before applying the srvx patch, real Zone.js Angular development requests were blocked by srvx's Promise detection. Both `self` and `node-worker` configurations fail; direct Vite serves the first render and then empty 500s. The apparent Nx discrepancy was reduced to the same dependency bug, not an executor-specific root cause. See [h3js/srvx#302](https://github.com/h3js/srvx/issues/302). With the patch, three successive real Angular `/about` SSR requests return 200 with rendered content. Browser development qualification remains separate.

## Measurements

Three uncached, app-only builds used the same command on each side:

```sh
pnpm nx run blog-app:build --skip-nx-cache --excludeTaskDependencies
```

| Metric                            |  Upstream alpha baseline |             Final integration |
| --------------------------------- | -----------------------: | ----------------------------: |
| Build times, seconds              | 12.859 / 13.084 / 14.001 |      14.702 / 14.645 / 15.066 |
| Median, seconds                   |                   13.084 |                        14.702 |
| Output bytes                      |                6,523,677 |                    24,245,423 |
| Output files                      |                      159 |                           212 |
| Rendered HTML files               |                        7 |                             7 |
| Portable `/about` response        | HTTP 500, three attempts |      HTTP 200, three attempts |
| Cold start to successful `/about` |     No successful sample | 0.208 / 0.213 / 0.213 seconds |

These timings do **not** demonstrate a build-speed improvement. The new output includes a 16,645,008-byte Sharp libvips library and the native Sharp binding that the old deployment omitted, alongside bundled runtime dependencies. The smaller baseline is not an equivalent deployable artifact. Chunking and dependency portability are the principal improvements; full deployment size must include required native libraries.

## Upstream issues

Opened and exact-read back: [Miniflare runner drops method, headers and body for Request inputs — unjs/env-runner#46](https://github.com/unjs/env-runner/issues/46).

The issue contains a runnable two-file reproduction with no Analog, Nitro, or Vite dependency; observed/expected output; a pinned source link; the session-authentication/form-submission use case; and an AI implementation prompt covering RequestInit overrides, streaming bodies, cancellation, adapter compatibility, and concurrent requests.

Also opened and exact-read back: [Node adapter returns empty 500s after Zone.js replaces global Promise — h3js/srvx#302](https://github.com/h3js/srvx/issues/302). Its runnable single-file reproduction uses only srvx and Zone.js: the first request returns `200 "ok"`, then two requests return empty 500s. It includes the Angular/Nitro use case and an AI prompt covering native/alternate promises, the synchronous fast path, rejections, streaming, and shutdown. The workspace now applies a temporary exact-version patch; see `patches/README.md`.

Both bugs are covered by repository-owned pnpm patches and `platform:nitro-patches`. Real HTTP regressions pass for Request overrides, streaming, cookies, HEAD, cancellation, repeated Zone.js requests, cross-realm promises and rejected handlers. `platform:nitro-cloudflare` now passes development and local production checks, including concurrent sessions. The fixture shuts down successfully. Consumers must apply the patches themselves until fixed releases ship; publishing Analog does not propagate workspace patches.

Tracking issue: [analogjs/analog#2534](https://github.com/analogjs/analog/issues/2534). The branch is being submitted as a draft PR against `alpha` while qualification remains incomplete.

## Reproduction and evidence

Primary reusable checks:

```sh
pnpm install --frozen-lockfile
pnpm nx run platform:nitro-conformance
pnpm nx run-many --target test --projects platform,vite-plugin-nitro
pnpm nx run-many --target build --all
```

Session logs live under `/tmp/analog-nitro-*.log`; timing and portability JSON are `/tmp/analog-nitro-baseline-metrics.json`, `/tmp/analog-nitro-final-metrics-r2.json`, and `/tmp/analog-nitro-portability.json`. Packed-consumer location is recorded in `/tmp/analog-nitro-consumer-path`. These temporary files are local evidence, not committed artifacts or CI results.

The user-facing migration guide is `apps/docs-analog/src/content/features/server/nitro-v3.md`. Publication and CI status are tracked on the draft PR; no deployment has been performed.

## Patch qualification follow-up

`pnpm install` with both patch hashes passed, including prepare. `platform:nitro-patches` and `platform:nitro-cloudflare` passed. The latter exercises the native development runner and a built worker through Wrangler, not a deployed Cloudflare account. The full workspace test suite rerun under Xvfb passed 18 of 19 targets; only docs-analog failed its five suites with syntax errors. The headed-browser target passed. The full build passed again for 23 projects plus 8 dependent tasks, and the patched frozen install passed including prepare. Earlier full lint/typecheck failures above remain open until a successful rerun proves otherwise.
