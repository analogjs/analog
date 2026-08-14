import {
  MarkedContentHighlighter,
  MarkdownContentRendererService,
  provideContent,
  withMarkdownRenderer,
} from '@analogjs/content';

export const contentBasicFixture = [
  MarkedContentHighlighter,
  MarkdownContentRendererService,
  provideContent,
  withMarkdownRenderer,
];
