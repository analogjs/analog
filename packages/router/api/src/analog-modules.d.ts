/**
 * The analog:* virtual modules resolved by the @analogjs/platform
 * esbuild plugins when an app's server entry is bundled. Declared here
 * so createAnalogRequestHandler can import them lazily; outside that
 * pipeline the imports fail at runtime and are caught.
 */
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
  const modules: Record<string, Record<string, unknown>>;
  export default modules;
}

declare module 'analog:server-middleware' {
  const files: Record<string, () => Promise<{ default: unknown }>>;
  export default files;
}
