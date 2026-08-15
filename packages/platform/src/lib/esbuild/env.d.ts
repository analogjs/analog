/**
 * Ambient declarations for the analog:* virtual modules resolved by the
 * Analog esbuild plugins. Reference from an application tsconfig with:
 *
 *   "types": ["@analogjs/platform/esbuild-env"]
 */
declare module 'analog:route-files' {
  const files: import('@analogjs/router').Files;
  export default files;
}

declare module 'analog:content-files' {
  export const contentFilesList: Record<string, Record<string, unknown>>;
  export const contentFiles: Record<string, () => Promise<string>>;
}

declare module 'analog:api-routes' {
  const files: Record<string, () => Promise<{ default: unknown }>>;
  export default files;
}

declare module 'analog:page-endpoints' {
  const endpoints: Record<
    string,
    true | (() => Promise<Record<string, unknown>>)
  >;
  export default endpoints;
}

declare module 'analog:server-fns' {
  // Importing registers each module's server functions by id; the map
  // is passed to createAnalogRequestHandler to make that explicit.
  const modules: Record<string, Record<string, unknown>>;
  export default modules;
}

declare module 'analog:server-middleware' {
  const files: Record<string, () => Promise<{ default: unknown }>>;
  export default files;
}
