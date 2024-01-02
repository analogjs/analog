/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALOG_PUBLIC_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  import type { Component, Directive, Pipe } from '@angular/core';

  interface Window {
    defineComponentMetadata: (
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
    defineDirectiveMetadata: (
      metadata: Omit<Directive, 'host' | 'standalone'>
    ) => void;
    definePipeMetadata: (metadata: Omit<Pipe, 'standalone'>) => void;
  }
}

declare module '*.ng' {
  const cmp = any;
  export default cmp;
}
