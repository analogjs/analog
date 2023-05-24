import { inject } from '@angular/core';
import { RouteExport } from './models';

export function toMarkdownModule(
  markdownFileFactory: () => Promise<string>
): () => Promise<RouteExport> {
  return () =>
    Promise.all([import('@analogjs/content'), markdownFileFactory()]).then(
      ([
        { parseRawContentFile, MarkdownRouteComponent, ContentRenderer },
        markdownFile,
      ]) => {
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
      }
    );
}
