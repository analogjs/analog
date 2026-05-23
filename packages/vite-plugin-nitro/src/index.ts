/**
 * @deprecated `@analogjs/vite-plugin-nitro` has been deprecated. The Nitro
 * orchestration lives in `@analogjs/platform`, which composes Nitro's
 * first-party Vite plugin (`nitro/vite`) with Analog's `analogNitroPlugin`.
 *
 * Migration:
 * - Replace `import { nitro } from '@analogjs/vite-plugin-nitro'` with
 *   `import { analog } from '@analogjs/platform'` and use `analog()` in
 *   your Vite plugin chain.
 * - Type exports (`SitemapConfig`, `PrerenderRouteConfig`,
 *   `PrerenderContentDir`, etc.) are re-exported from `@analogjs/platform`.
 *
 * This package is kept as a placeholder so existing dependency declarations
 * don't fail to install, but it no longer exposes a Vite plugin.
 */
export {};
