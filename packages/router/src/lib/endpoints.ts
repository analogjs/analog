export const ANALOG_META_KEY = Symbol(
  '@analogjs/router Analog Route Metadata Key'
);

export const PAGE_ENDPOINTS = import.meta.glob([
  '/src/app/pages/**/*.server.ts',
]);
