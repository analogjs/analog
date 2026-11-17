// `@tsrx/core` is an optional peer dependency that ships JavaScript without
// declarations. Only the API the TSRX lowering uses is declared here.
declare module '@tsrx/core' {
  export function parseModule(
    source: string,
    fileName: string,
    options?: unknown,
  ): unknown;
}
