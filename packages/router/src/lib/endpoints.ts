// @ts-ignore
import pageImports from 'analog-pages/**/*';

export const ANALOG_META_KEY = Symbol(
  '@analogjs/router Analog Route Metadata Key'
);

let PAGE_ENDPOINTS: any = {};

if (pageImports === undefined) {
  PAGE_ENDPOINTS = import.meta.glob(['/src/app/pages/**/*.server.ts']);
}

export { PAGE_ENDPOINTS };
