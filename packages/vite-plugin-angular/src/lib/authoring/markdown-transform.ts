export type MarkdownTemplateTransform = (
  content: string,
  fileName: string
) => string | Promise<string>;

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

export const defaultMarkdownTemplateTransforms: MarkdownTemplateTransform[] = [
  defaultMarkdownTemplateTransform,
];
