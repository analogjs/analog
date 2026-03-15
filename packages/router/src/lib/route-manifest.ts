/**
 * Re-exports from @analogjs/router/manifest.
 *
 * The canonical implementation lives in packages/router/manifest/src/index.ts.
 * This file re-exports everything so the @analogjs/router main entry point
 * continues to expose the manifest API.
 */
export {
  filenameToRoutePath,
  extractRouteParams,
  detectSchemaExports,
  generateRouteManifest,
  generateRouteTableDeclaration,
  formatManifestSummary,
} from '@analogjs/router/manifest';

export type {
  RouteParamInfo,
  RouteSchemaInfo,
  RouteEntry,
  RouteManifest,
} from '@analogjs/router/manifest';
