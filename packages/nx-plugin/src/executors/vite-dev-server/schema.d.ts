export { ViteDevServerExecutorOptions } from '@nx/vite/executors';
export interface ViteDevServerSchema {
  buildTarget: string;
  port?: number;
  hmr?: boolean;
}
