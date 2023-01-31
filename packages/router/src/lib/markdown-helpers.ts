import { RouteExport } from './models';

export function toMarkdownModule(
  markdownFileFactory: () => Promise<string>
): () => Promise<RouteExport> {
  return () =>
    Promise.all([import('@analogjs/content'), markdownFileFactory()]).then(
      ([{ parseRawContentFile, MarkdownComponent }, markdownFile]) => {
        const { content, attributes } = parseRawContentFile(markdownFile);
        const { title, meta } = attributes;

        return {
          default: MarkdownComponent,
          routeMeta: { data: { _analogContent: content }, title, meta },
        };
      }
    );
}
