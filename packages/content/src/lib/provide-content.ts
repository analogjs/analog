import { Provider, InjectionToken } from '@angular/core';
import { ContentRenderer } from './content-renderer';
import { MarkdownContentRendererService } from './markdown-content-renderer.service';
import { MarkedSetupService } from './marked-setup.service';
import { RenderTaskService } from './render-task.service';

export interface MarkdownRendererOptions {
  loadMermaid?: () => Promise<typeof import('mermaid')>;
}

export function withMarkdownRenderer(
  options?: MarkdownRendererOptions
): Provider {
  return [
    MarkedSetupService,
    {
      provide: ContentRenderer,
      useFactory: () => new MarkdownContentRendererService(),
      deps: [MarkedSetupService],
    },
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
