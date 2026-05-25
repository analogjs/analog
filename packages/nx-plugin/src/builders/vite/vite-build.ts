/**
 * Thin shim that re-exports the Angular Devkit Architect build builder
 * shipped by `@analogjs/vite-plugin-angular`. Architect resolves the
 * implementation from the local `builders.json` entry without traversing a
 * cross-package string redirect, so the user-facing `@analogjs/platform:vite`
 * identifier stays stable while the real implementation continues to live in
 * `@analogjs/vite-plugin-angular`. Mirrors `@analogjs/storybook-angular`'s
 * pattern for surfacing `@storybook/angular`'s builders.
 */
import viteBuilder from '@analogjs/vite-plugin-angular/builders/vite';

export default viteBuilder;
