/// <reference types="vite/client" />

// Uncomment the lines below to enable types for experimental .analog format support
// interface ImportAttributes {
//   analog: 'imports' | 'providers' | 'viewProviders' | 'exposes';
// }
//
// declare global {
//   import type { Component } from '@angular/core';
//
//   interface Window {
//     /**
//      * Define the metadata for the component.
//      * @param metadata
//      */
//     defineMetadata: (
//       metadata: Omit<
//         Component,
//         | 'template'
//         | 'standalone'
//         | 'changeDetection'
//         | 'styles'
//         | 'outputs'
//         | 'inputs'
//       > & { exposes?: unknown[] }
//     ) => void;
//     /**
//      * Invoke the callback when the component is initialized.
//      */
//     onInit: (initFn: () => void) => void;
//     /**
//      * Invoke the callback when the component is destroyed.
//      */
//     onDestroy: (destroyFn: () => void) => void;
//   }
// }

// declare module '*.analog' {
//   const cmp = any;
//   export default cmp;
// }
