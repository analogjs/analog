// Ambient type shim for @analogjs/content.
//
// The router/content secondary entrypoint imports from @analogjs/content, but
// pointing the tsconfig path at ../content/src causes TS6059 ("file is not
// under rootDir") because ngc tries to pull the entire content source tree into
// the router compilation. Pointing at ../content/dist/types/src works but
// forces content:build to run before router:build, reintroducing the
// build-order coupling this branch removes.
//
// This shim declares just enough surface for markdown-helpers.ts to compile
// without reaching outside the router rootDir. It is intentionally minimal —
// if the real @analogjs/content types drift, the build will still catch
// mismatches at integration time because content:build runs before publish and
// the published package resolves the real types.

declare module '@analogjs/content' {
  export type TableOfContentItem = {
    id: string;
    level: number;
    text: string;
  };

  export type RenderedContent = {
    content: string;
    toc: TableOfContentItem[];
  };

  export function parseRawContentFile(raw: string): {
    content: string;
    attributes: Record<string, any>;
  };
  export function parseRawContentFile<TSchema>(
    rawContentFile: string,
    schema: TSchema,
    filename?: string,
  ): { content: string; attributes: unknown };

  export const MarkdownRouteComponent: import('@angular/core').Type<unknown>;

  export abstract class ContentRenderer {
    render(content: string): Promise<RenderedContent>;
  }
}
