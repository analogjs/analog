/**
 * The analog:* virtual modules resolved by the @analogjs/platform
 * esbuild plugins. This entry only ever runs inside a server bundle
 * built by those plugins, so it imports them statically.
 */
declare module 'analog:route-files' {
  const files: import('@analogjs/router').Files;
  export default files;
  export const routeFilesMeta: Record<string, { prerender?: boolean }>;
}

declare module 'analog:page-endpoints' {
  const endpoints: Record<
    string,
    true | (() => Promise<Record<string, unknown>>)
  >;
  export default endpoints;
}
