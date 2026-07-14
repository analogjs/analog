# Vendored: Angular type-check-block generator

This directory is a **verbatim snapshot** of Angular's TypeScript-decoupled
type-check-block (TCB) generator, vendored so Analog's `fastCompile` path can
generate TCBs without a `ts.Program` and check them out-of-band (in a worker,
via `tsgo` / a vanilla `ts.Program`).

| | |
|---|---|
| **Upstream** | `angular/angular` |
| **Path** | `packages/compiler/src/typecheck/` |
| **Pinned ref** | `d5e0b13` (main, unreleased as of Angular 22) |
| **Snapshot** | 32 files, ~6,362 LOC |
| **License** | MIT (Google LLC — headers preserved in every file) |
| **Refresh** | `./refresh.sh <ref>` (verbatim re-fetch; see below) |

## Why vendor instead of import from `@angular/compiler`

The TCB generator was decoupled from the TypeScript API on `angular/angular`
`main` **after** the 22.x release. Analog pins `@angular/compiler@^22.0.0`, whose
published package does **not** contain this code. Vendoring lets us build
against the decoupled generator today without taking a dependency on an
unreleased Angular build, and — because the subtree has **zero `import ... from
'typescript'`** — it is copy-pasteable in a way `compiler-cli`'s TCB code never
was.

## Golden rule: verbatim in, adapt on top

`refresh.sh` **overwrites** this whole subtree from upstream. Never hand-edit the
fetched files — any local change (see "Import rewiring" below) belongs in a
**separate commit** layered on top of the verbatim import, so the next refresh
produces a clean `git diff` against upstream and the adaptation is re-applied as
a reviewable patch rather than silently lost.

## The dependency boundary (this is the real work)

"Zero TypeScript imports" is true, but the subtree is **not** self-contained: its
32 files reach into **13 other `@angular/compiler` internal modules**. Wiring
those up is the actual integration cost. Measured against the **shipped
`@angular/compiler@22.0.0` public API**, the boundary splits in two:

### Reachable from the public API — rewrite `../x` → `@angular/compiler`
- `core` → `SchemaMetadata`
- `property_mapping` → `ClassPropertyMapping`
- `render3/r3_ast` → `TmplAst*` node types
- `render3/r3_identifiers` → `R3Identifiers` / `Identifiers`
- `render3/view/template` → `parseTemplate`
- `template_parser/binding_parser` → `makeBindingParser`

### NOT exported by `@angular/compiler@22.0.0` — must also be vendored
- **`render3/view/t2_api` + `render3/view/t2_binder`** → `BoundTarget`,
  `R3TargetBinder` — **the binder the whole approach depends on.** Not public,
  and the package ships flattened (no deep imports), so it is unreachable except
  by vendoring.
- `expression_parser/ast` → expression AST + `AbsoluteSourceSpan`
- `parse_util` → `ParseSourceSpan` etc.
- `schema/dom_element_schema_registry` → `DomElementSchemaRegistry`
- `directive_matching`
- `render3/util`, `render3/view/util`

> ⚠️ **Version-drift hazard.** This snapshot is from `main` (post-22). Any symbol
> rewired to the **22.0.0** public API is a `main`-generated consumer typed
> against a 22.0.0 declaration. Where the shapes drifted (most likely around
> `BoundTarget` / the directive-metadata types), the rewire won't type-check —
> which is one more reason the load-bearing `t2_*` modules are safer **vendored
> at the same ref** than imported. The only definitive check is compiling the
> wired result; that needs `node_modules` installed.

## Status

- [x] Verbatim snapshot of the `typecheck/` subtree (this commit).
- [ ] Vendor the non-public transitive closure (`t2_api`/`t2_binder`,
      `expression_parser/ast`, `parse_util`, `dom_element_schema_registry`,
      `directive_matching`, `render3/util`, `render3/view/util`) at the same ref.
- [ ] Rewire the public-reachable imports to `@angular/compiler`.
- [ ] `TcbEnvironment` implementation (6 methods) + `RegistryEntry →
      TcbTypeCheckBlockMetadata` adapter.
- [ ] Out-of-band check worker (`tsgo`) + template span mapping.

This subtree lives **outside** `src/` and is excluded from the package build/lint
on purpose: as a raw verbatim snapshot with unresolved cross-module imports it
does not compile until the wiring steps above land.
