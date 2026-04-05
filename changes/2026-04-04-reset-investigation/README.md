## 2026-04-04 Reset Investigation

This folder snapshots the Analog repo changes made during the HMR and Angular compilation investigation before reverting the live code back to `HEAD`.

### Purpose

- preserve the exact work done in the local Analog fork
- make it easy to re-apply one slice at a time
- reset the working tree to a stable baseline for smaller, controlled re-implementation

### Captured Scope

The saved patches cover:

- docs and contributor guidance
- `@analogjs/platform` local-linking behavior
- `@analogjs/vite-plugin-angular` HMR, external resource tracking, and served HMR module changes

### Files

- `status-before-revert.txt`
  - working tree status before restoration
- `patches/full.patch`
  - complete combined diff for the captured Analog changes
- `patches/docs.patch`
  - `CONTRIBUTING.md` and docs-app debugging guide changes
- `patches/platform.patch`
  - `packages/platform/src/lib/platform-plugin.ts`
  - `packages/platform/src/lib/platform-plugin.spec.ts`
- `patches/vite-plugin-angular.patch`
  - `packages/vite-plugin-angular/src/lib/angular-vite-plugin.ts`
  - `packages/vite-plugin-angular/src/lib/angular-vite-plugin.spec.ts`
  - `packages/vite-plugin-angular/src/lib/angular-vite-plugin-live-reload.spec.ts`
  - `packages/vite-plugin-angular/src/lib/live-reload-plugin.ts`
  - `packages/vite-plugin-angular/src/lib/live-reload-plugin.spec.ts`

### Notes

- This snapshot intentionally does not treat `BundleSizeAnalysisPlan.md` as part of the revert set.
- Some late-stage probe logging was included in the captured `vite-plugin-angular` patch to preserve the exact investigation state.
- After this snapshot is created, the intended next step is restoring the modified tracked files to `HEAD` and re-implementing in smaller steps.
