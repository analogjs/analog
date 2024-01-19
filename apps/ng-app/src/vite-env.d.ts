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
    /**
     * Define the metadata for the component.
     * @param metadata
     */
    defineMetadata: (
      metadata: Omit<
        Component,
        | 'template'
        | 'templateUrl'
        | 'standalone'
        | 'changeDetection'
        | 'styleUrls'
        | 'styleUrl'
        | 'styles'
        | 'outputs'
        | 'inputs'
      >
    ) => void;

    /**
     * Invoke the callback when the component is initialized.
     */
    onInit: () => void;
    /**
     * Invoke the callback when the component is destroyed.
     */
    onDestroy: () => void;
  }
}

declare module '*.ng' {
  const cmp = any;
  export default cmp;
}
