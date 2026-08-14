declare module 'analog:route-files' {
  const files: import('@analogjs/router').Files;
  export default files;
}

declare module 'analog:content-files' {
  export const contentFilesList: Record<string, Record<string, unknown>>;
  export const contentFiles: Record<string, () => Promise<string>>;
}
