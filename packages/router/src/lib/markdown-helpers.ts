import { inject } from '@angular/core';
import { RouteExport } from './models';

declare const Zone: any;

// The Zone is currently enabled by default, so we wouldn't need this check.
// However, leaving this open space will be useful if zone.js becomes optional
// in the future. This means we won't have to modify the current code, and it will
// continue to work seamlessly.
const isNgZoneEnabled = typeof Zone !== 'undefined' && !!Zone.root;

export function toMarkdownModule(
  markdownFileFactory: () => Promise<string>,
): () => Promise<RouteExport> {
  return async () => {
    const createLoader = () =>
      Promise.all([import('@analogjs/content'), markdownFileFactory()]);

    const [
      { parseRawContentFile, MarkdownRouteComponent, ContentRenderer },
      markdownFile,
    ]: [typeof import('@analogjs/content'), string] = await (isNgZoneEnabled
      ? // We are not able to use `runOutsideAngular` because we are not inside
        // an injection context to retrieve the `NgZone` instance.
        // The `Zone.root.run` is required when the code is running in the
        // browser since asynchronous tasks being scheduled in the current context
        // are a reason for unnecessary change detection cycles.
        Zone.root.run(createLoader)
      : createLoader());

    const { content, attributes } = parseRawContentFile(markdownFile);
    const { title, meta } = attributes;

    return {
      default: MarkdownRouteComponent,
      routeMeta: {
        data: { _analogContent: content },
        title,
        meta,
        resolve: {
          renderedAnalogContent: async () => {
            const contentRenderer = inject(ContentRenderer);
            return contentRenderer.render(content);
          },
        },
      },
    };
  };
}
