import { inject } from '@angular/core';
import {
  ContentRenderer,
  MarkdownRouteComponent,
  parseRawContentFile,
} from '@analogjs/content';

import type { RouteExport } from '../../../src/lib/models';

declare const Zone: any;

type RenderResult = string | { content: string };
type ContentRendererLike = {
  render: (content: string) => Promise<RenderResult>;
};

const isNgZoneEnabled = typeof Zone !== 'undefined' && !!Zone.root;

export function toMarkdownModule(
  markdownFileFactory: () => Promise<string>,
): () => Promise<RouteExport> {
  return async () => {
    const markdownFile = await (isNgZoneEnabled
      ? Zone.root.run(markdownFileFactory)
      : markdownFileFactory());

    const { content, attributes } = parseRawContentFile(markdownFile);
    const { title, meta, jsonLd } = attributes;

    return {
      default: MarkdownRouteComponent,
      routeMeta: {
        data: { _analogContent: content },
        title,
        meta,
        jsonLd,
        resolve: {
          renderedAnalogContent: async () => {
            const contentRenderer = inject<any>(
              ContentRenderer as any,
            ) as ContentRendererLike;
            const rendered = await contentRenderer.render(content);
            return typeof rendered === 'string' ? rendered : rendered.content;
          },
        },
      },
    };
  };
}
