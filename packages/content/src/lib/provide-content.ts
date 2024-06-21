import { Provider, InjectionToken } from '@angular/core';
import { ContentRenderer } from './content-renderer';
import { MarkdownContentRendererService } from './markdown-content-renderer.service';
import { MarkedSetupService } from './marked-setup.service';
import { RenderTaskService } from './render-task.service';

export interface MarkdownRendererOptions {
  loadMermaid?: () => Promise<typeof import('mermaid')>;
}

const CONTENT_RENDERER_PROVIDERS: Provider[] = [
  MarkedSetupService,
  {
    provide: ContentRenderer,
    useFactory: () => new MarkdownContentRendererService(),
    deps: [MarkedSetupService],
  },
];

export function withMarkdownRenderer(
  options?: MarkdownRendererOptions
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
