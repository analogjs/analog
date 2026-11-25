export interface ViteDevServerSchema {
  buildTarget: string;
  port?: number;
  host?: string | boolean;
  hmr?: boolean;
}
