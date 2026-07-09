import { MarkdownComponent } from '@analogjs/content';
import { provideOptimizedMarkdownImages } from '@analogjs/content/image';
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
    provideOptimizedMarkdownImages({
      sizes: '(max-width: 768px) 100vw, 768px',
    }),
  ],
  template: `<analog-markdown />`,
})
export default class PreviewComponent {}
