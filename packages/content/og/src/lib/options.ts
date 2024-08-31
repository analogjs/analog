import type { SatoriOptions } from 'satori/wasm';

export interface ImageResponseOptions {
  width?: number;
  height?: number;
  fonts?: SatoriOptions['fonts'];
  debug?: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  tailwindConfig?: SatoriOptions['tailwindConfig'];
}
