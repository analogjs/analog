import { Provider, InjectionToken } from '@angular/core';
import { ContentRenderer, NoopContentRenderer } from './content-renderer';
import { RenderTaskService } from './render-task.service';
import { withContentFileLoader } from './content-file-loader';
import { withContentListLoader } from './content-list-loader';

export interface MarkdownRendererOptions {
  loadMermaid?: () => Promise<typeof import('mermaid')>;
}

const CONTENT_RENDERER_PROVIDERS: Provider[] = [
  {
    provide: ContentRenderer,
    useClass: NoopContentRenderer,
  },
  withContentFileLoader(),
  withContentListLoader(),
];

export function withMarkdownRenderer(
  options?: MarkdownRendererOptions,
): Provider {
  return [
    CONTENT_RENDERER_PROVIDERS,
    options?.loadMermaid
      ? [
          {
            provide: MERMAID_IMPORT_TOKEN,
            useFactory: options.loadMermaid,
          },
        ]
      : [],
  ];
}

export function provideContent(...features: Provider[]) {
  return [
    { provide: RenderTaskService, useClass: RenderTaskService },
    ...features,
  ];
}

export const MERMAID_IMPORT_TOKEN = new InjectionToken<
  Promise<typeof import('mermaid')>
>('mermaid_import');
