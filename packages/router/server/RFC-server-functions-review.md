# Server Functions Adversarial Review

Review target: `feat/server-functions-rfc`

All findings below have been **resolved**; each notes the fix and the test that
now covers it. Verified against the built `node_modules` packages.

## Findings

### High: Server functions are unreachable when an API dir exists — RESOLVED

The dispatch handler was registered at `/api/_analog/fn/:id` when `hasAPIDir`,
but client refs always call `/_analog/fn/:id`. The demo has
`src/server/routes/api`, so it was genuinely unreachable.

Fix: `getServerFnDispatchHandler()` no longer takes `hasAPIDir` and always
registers the absolute `/_analog/fn/:id` route.

- `packages/vite-plugin-nitro/src/lib/utils/server-fn-endpoints.ts`
- test: `server-fn-endpoints.spec.ts` — "never /api-prefixes the route"

### High: The server never enforces the configured HTTP method — RESOLVED

Fix: the generated handler passes `event.method` into `dispatchServerFn`, which
rejects a mismatch with `405` + `Allow: <method>`.

- `packages/router/server/src/server-fn/dispatch.ts`
- `packages/vite-plugin-nitro/src/lib/utils/server-fn-endpoints.ts`
- test: `validate-http-server-fn.ts` — POST→GET-fn and GET→POST-fn both 405

### High: `method: 'GET'` with `input` is allowed but cannot work — RESOLVED

Fix: both build transforms and the runtime `serverFn` now throw on
`method: 'GET'` + `input` ("GET carries no body").

- `packages/vite-plugin-nitro/src/lib/utils/inject-server-fn-ids.ts`
- `packages/platform/src/lib/server-fn-client-transform.ts`
- `packages/router/server/src/server-fn/server-fn.ts`
- tests: `inject-server-fn-ids.spec.ts`, `server-fn-client-transform.spec.ts`

### High: `Response` headers are discarded — RESOLVED

Fix: `dispatchServerFn` now returns `headers` from a returned `Response`, and the
generated Nitro handler applies them via `res.setHeader`. `Location` (redirect),
`Set-Cookie`, and `X-Analog-Errors` (fail) now propagate.

- `packages/router/server/src/server-fn/dispatch.ts`
- `packages/vite-plugin-nitro/src/lib/utils/server-fn-endpoints.ts`
- test: `validate-http-server-fn.ts` — 401 deny preserves `X-Analog-Errors`

### Medium: Async interceptors can break DI for downstream handlers — RESOLVED

Fix: `runInterceptors` takes a `runInCtx` wrapper and re-enters
`runInInjectionContext` at every hop (each interceptor and the handler), so
`inject()` works even when an interceptor `await`s before `next`.

- `packages/router/server/src/server-fn/dispatch.ts`
- `packages/router/server/src/server-fn/interceptors.ts`
- tests: `interceptors.spec.ts` (handler runs inside `runInCtx` after an await);
  the demo interceptor now awaits before `next`, exercised by every dispatch harness

## Test Gaps — CLOSED

- Apps with an existing `src/server/routes/api` dir: route is now always
  `/_analog/fn/:id` (unit test) and the demo app itself has that dir.
- Method mismatch rejection: covered by the 405 HTTP-harness cases.
- `method: 'GET'` + `input`: rejected at build time (transform specs).
- `redirect()` / `fail()` header propagation: `X-Analog-Errors` asserted over HTTP.
- Async interceptor awaiting before `next`: `interceptors.spec.ts` + demo.
