export interface ViteDevServerExecutorOptions {
  buildTarget: string;
  buildLibsFromSource?: boolean;
  proxyConfig?: string;
  port?: number;
  host?: boolean | string;
  https?: boolean | Record<string, unknown>;
  hmr?: boolean;
  open?: boolean | string;
  cors?: boolean;
  logLevel?: 'info' | 'warn' | 'error' | 'silent';
  mode?: string;
  clearScreen?: boolean;
  force?: boolean;
}
