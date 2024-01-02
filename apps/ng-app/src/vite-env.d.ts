/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALOG_PUBLIC_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  import type { Component } from '@angular/core';

  interface Window {
    defineMetadata: (
      metadata: Omit<
        Component,
        | 'template'
        | 'templateUrl'
        | 'host'
        | 'standalone'
        | 'changeDetection'
        | 'styleUrls'
        | 'styleUrl'
        | 'styles'
      >
    ) => void;
  }
}

declare module '*.ng' {
  const cmp = any;
  export default cmp;
}
