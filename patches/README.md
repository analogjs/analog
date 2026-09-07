# Temporary Nitro qualification patches

These exact-version patches are applied by pnpm through the root `package.json` and recorded with their content hashes in `pnpm-lock.yaml`. Install with `pnpm install --frozen-lockfile`. They modify published JavaScript only; the affected packages ship no corresponding source maps and the public types do not change.

| Patch                    | Upstream bug                                                       | Behavior restored                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env-runner@0.2.1.patch` | [unjs/env-runner#46](https://github.com/unjs/env-runner/issues/46) | Preserve Request method, headers, streaming body, redirect and cancellation when dispatching to Miniflare; apply RequestInit overrides through the native Request constructor without assuming srvx shares its private brand. |
| `srvx@1.0.3.patch`       | [h3js/srvx#302](https://github.com/h3js/srvx/issues/302)           | Recognize promise-like responses in both Node adapter paths after Zone.js replaces global Promise; retain synchronous responses and existing rejection handling.                                                              |

Run `pnpm nx run platform:nitro-patches` for independent real-HTTP regressions, `pnpm nx run platform:nitro-conformance` for Node integration, and `pnpm nx run platform:nitro-cloudflare` for local Workers development/production. The first target tests RequestInit overrides, concurrent cookie isolation, streamed srvx requests, HEAD, abort, repeated Zone.js rendering, cross-realm promises, synchronous responses and rejection handling.

Remove each patch and its `patchedDependencies` entry only after upgrading to an upstream release that fixes the linked issue and passing these same checks without the patch. Regenerate the lockfile and verify a frozen install. Do not silently carry patches across dependency versions.

## Applications and packed consumers

Workspace patches are **not propagated by publishing Analog packages**. Until fixed dependencies are available, a pnpm consumer must copy these two patch files into its own `patches/` directory and add the following to its root `package.json` (merge with existing pnpm settings):

```json
{
  "pnpm": {
    "patchedDependencies": {
      "env-runner@0.2.1": "patches/env-runner@0.2.1.patch",
      "srvx@1.0.3": "patches/srvx@1.0.3.patch"
    }
  }
}
```

Run `pnpm install` to record patch hashes in the consumer lockfile, then `pnpm install --frozen-lockfile` to verify reproducibility. Both upstream reports include standalone samples, application use cases, and AI implementation prompts.
