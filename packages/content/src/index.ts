export { AnchorNavigationDirective } from './lib/anchor-navigation.directive';
export { injectContent } from './lib/content';
// These are type-only in source. Exporting them as runtime values worked when
// consumers hit built output, but breaks once workspace development resolves
// directly against source.
export type { ContentFile } from './lib/content-file';
export { ContentRenderer, NoopContentRenderer } from './lib/content-renderer';
export type {
  RenderedContent,
  TableOfContentItem,
} from './lib/content-renderer';
export { injectContentFiles } from './lib/inject-content-files';
export type { InjectContentFilesFilterFunction } from './lib/inject-content-files';
export { MarkdownContentRendererService } from './lib/markdown-content-renderer.service';
export {
  provideContent,
  withMarkdownRenderer,
  MERMAID_IMPORT_TOKEN,
} from './lib/provide-content';
export { default as MarkdownRouteComponent } from './lib/markdown-route.component';
export { default as MarkdownComponent } from './lib/markdown.component';
export {
  parseRawContentFile,
  parseRawContentFileAsync,
  FrontmatterValidationError,
} from './lib/parse-raw-content-file';
export { MarkedSetupService } from './lib/marked-setup.service';
export {
  MarkedContentHighlighter,
  withHighlighter,
} from './lib/marked-content-highlighter';
export { injectContentFilesMap } from './lib/inject-content-files';
export {
  injectContentListLoader,
  withContentListLoader,
  CONTENT_LIST_LOADER,
} from './lib/content-list-loader';
export {
  injectContentFileLoader,
  withContentFileLoader,
  CONTENT_FILE_LOADER,
} from './lib/content-file-loader';
export {
  contentDevToolsPlugin,
  DevToolsContentRenderer,
  withContentDevTools,
} from './lib/devtools/index';
