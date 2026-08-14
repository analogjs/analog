/**
 * These bindings are rewritten at build time:
 *   - `ANALOG_CONTENT_FILE_LIST` by `@analogjs/platform`'s content plugin,
 *     which substitutes the empty-object initializer with the frontmatter
 *     map for discovered content files.
 *   - `ANALOG_CONTENT_ROUTE_FILES` by `@analogjs/platform`'s router plugin,
 *     which substitutes the empty-object initializer with the lazy-import
 *     map for discovered content files. The router plugin already rewrites
 *     a same-named binding exported from `@analogjs/router/content`; it
 *     matches this module for free because its filter keys off `_ROUTE_FILES`.
 *
 * They are declared as `export const` at module scope so the bundler treats
 * them as public module bindings and cannot constant-fold them away during
 * library build. Previously these lived as local consts inside each getter,
 * and Rolldown collapsed `const X = {}; return X;` into `return {};`, which
 * erased the rewrite target the platform plugins rely on.
 */

export const ANALOG_CONTENT_FILE_LIST = {};
export const ANALOG_CONTENT_ROUTE_FILES = {};

/**
 * Returns the list of content files by filename with ?analog-content-list=true.
 * We use the query param to transform the return into an array of
 * just front matter attributes.
 */
export const getContentFilesList = () =>
  ANALOG_CONTENT_FILE_LIST as Record<string, Record<string, any>>;

/**
 * Returns the lazy loaded content files for lookups.
 */
export const getContentFiles = () =>
  ANALOG_CONTENT_ROUTE_FILES as Record<string, () => Promise<string>>;
