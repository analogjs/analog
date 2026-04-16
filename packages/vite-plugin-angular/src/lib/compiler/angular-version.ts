import * as o from '@angular/compiler';

// Detect the installed @angular/compiler major version once at module load
// time and expose helpers for version-aware code paths.
//
// Why this matters: Angular's compiler API surface (enum members,
// metadata shapes, output formats) shifts between major versions in ways
// that can't always be papered over with duck typing. The compatibility
// matrix in .github/workflows/angular-compiler-compat.yml runs the test
// suite against multiple installed versions to catch this drift, and the
// version-aware code paths in compile.ts / js-emitter.ts / metadata.ts
// gate behavior on `ANGULAR_MAJOR` to keep the compiler working across
// the supported `peerDependencies` range (currently >=19.0.0).
//
// Default fallback: when the version string is missing or unparseable
// (vendored builds, monkey-patched test environments), assume the latest
// known major. This biases toward the most-tested code path.
const DEFAULT_ASSUMED_MAJOR = 22;

/**
 * The major version of the installed `@angular/compiler` package, parsed
 * from `o.VERSION.major`. Falls back to `DEFAULT_ASSUMED_MAJOR` when the
 * version is unavailable.
 */
export const ANGULAR_MAJOR: number = (() => {
  const major = Number.parseInt(o.VERSION?.major ?? '', 10);
  return Number.isFinite(major) && major > 0 ? major : DEFAULT_ASSUMED_MAJOR;
})();

/**
 * Returns `true` when the installed Angular major is at least `major`.
 * Use this to gate code paths that depend on APIs introduced in a
 * specific Angular release.
 *
 * @example
 *   if (angularVersionAtLeast(21)) {
 *     // Use Angular 21+ API
 *   } else {
 *     // Fall back to v19/v20 behavior
 *   }
 */
export function angularVersionAtLeast(major: number): boolean {
  return ANGULAR_MAJOR >= major;
}
