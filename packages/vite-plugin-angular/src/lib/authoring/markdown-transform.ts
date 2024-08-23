import type { Plugin, Settings } from 'unified';

export type MarkdownTemplateTransform = (
  content: string,
  fileName: string
) => string | Promise<string>;

export type PluginWithSettings<
  S extends any[] = [Settings?],
  P extends Plugin<S> = Plugin<S>
> = [P, ...S];
export type UnifiedPlugins = Array<PluginWithSettings | Plugin>;

export interface RemarkRehypeOptions {
  remarkPlugins?: UnifiedPlugins;
  rehypePlugins?: UnifiedPlugins;
}

export const defaultMarkdownTemplateTransform: MarkdownTemplateTransform =
  async (content: string) => {
    const { MarkedSetupService } = await import('./marked-setup.service.js');

    // read template sections, parse markdown
    const markedSetupService = new MarkedSetupService();
    const mdContent = markedSetupService
      .getMarkedInstance()
      .parse(content) as unknown as Promise<string>;

    return mdContent;
  };

export const remarkRehypeMarkdownTemplateTransform =
  (options: RemarkRehypeOptions = {}): MarkdownTemplateTransform =>
  async (content: string) => {
    const { RemarkSetupService } = await import('./remark-setup.service.js');
    const remarkSetupService = new RemarkSetupService(options);
    const mdContent = await remarkSetupService
      .getRemarkInstance()
      .process(content);

    return fixDoubleEscape(String(mdContent));
  };

export const defaultMarkdownTemplateTransforms: MarkdownTemplateTransform[] = [
  defaultMarkdownTemplateTransform,
];

function fixDoubleEscape(content: string) {
  return content
    .replace(/&#x26;#64;/g, '&#64;')
    .replace(/&#x26;#x2774;/g, '&#x2774;')
    .replace(/&#x26;#x2775;/g, '&#x2775;');
}
