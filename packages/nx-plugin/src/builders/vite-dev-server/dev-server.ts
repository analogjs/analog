/**
 * Thin shim that re-exports the Angular Devkit Architect dev-server builder
 * shipped by `@analogjs/vite-plugin-angular`. See `../vite/vite-build.ts` for
 * the rationale; mirrors `@analogjs/storybook-angular`'s pattern.
 */
import devServerBuilder from '@analogjs/vite-plugin-angular/builders/vite-dev-server';

export default devServerBuilder;
