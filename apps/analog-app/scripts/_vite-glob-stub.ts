/**
 * Bun preload for the server-function validation harnesses.
 *
 * The built `@analogjs/router/server` FESM is Vite-coupled: a sibling export
 * (`server-component-render`) calls the Vite-only `import.meta.glob` macro at
 * module-eval time. In the real app that entry is imported inside a Nitro route
 * where Vite defines the macro; under plain bun it is undefined and the barrel
 * cannot load. This preload rewrites the macro to a no-op at load time so the
 * harness can exercise the server-fn runtime from the built package. It touches
 * nothing in the server-fn code path under test.
 */
import { plugin } from 'bun';

(globalThis as unknown as { __viteGlobStub: () => object }).__viteGlobStub =
  () => ({});

plugin({
  name: 'vite-glob-stub',
  setup(build) {
    build.onLoad(
      { filter: /analogjs-router-server\.mjs$/ },
      async (args: { path: string }) => {
        const src = await Bun.file(args.path).text();
        const contents = src.replaceAll(
          'import.meta.glob',
          'globalThis.__viteGlobStub',
        );
        return { contents, loader: 'js' };
      },
    );
  },
});
