import {
  ContentRenderer,
  MarkdownComponent,
  MarkdownContentRendererService,
  MarkedSetupService,
} from '@analogjs/content';
import { provideOptimizedImages } from '@analogjs/content/image';
import { RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';

export const routeMeta: RouteMeta = {
  title: 'Preview',
  data: {
    _analogContent: `### Runtime Rendered Markdown

![Angular gradient](/angular-gradient.png)

This content is rendered at runtime through the markdown renderer.
`,
  },
};

@Component({
  standalone: true,
  imports: [MarkdownComponent],
  providers: [
    { provide: ContentRenderer, useClass: MarkdownContentRendererService },
    MarkedSetupService,
    provideOptimizedImages({ sizes: '(max-width: 768px) 100vw, 768px' }),
  ],
  template: `<analog-markdown />`,
})
export default class PreviewComponent {}
