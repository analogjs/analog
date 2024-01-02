/// <reference types="vite/client" />

// Uncomment the lines below to enable types for experimental .ng format support
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
//         | 'templateUrl'
//         | 'host'
//         | 'standalone'
//         | 'changeDetection'
//         | 'styleUrls'
//         | 'styleUrl'
//         | 'styles'
//       > & { exposes?: unknown[] }
//     ) => void;
//     /**
//      * Invoke the callback when the component is initialized.
//      */
//     onInit: () => void;
//     /**
//      * Invoke the callback when the component is destroyed.
//      */
//     onDestroy: () => void;
//   }
// }

// declare module '*.ng' {
//   const cmp = any;
//   export default cmp;
// }
