/**
 * Loads @angular/build, failing with an actionable error on Angular
 * versions before v18, where the package does not exist.
 */
export async function loadAngularBuild(): Promise<
  typeof import('@angular/build')
> {
  try {
    return await (Function('return import("@angular/build")')() as Promise<
      typeof import('@angular/build')
    >);
  } catch {
    throw new Error(
      "The '@analogjs/platform' esbuild builders require '@angular/build' (Angular v18 or newer) to be installed.",
    );
  }
}
