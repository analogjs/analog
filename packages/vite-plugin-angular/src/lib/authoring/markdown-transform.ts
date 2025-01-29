import { FRONTMATTER_REGEX } from './constants.js';
import { type VFile } from 'vfile';
import { type MarkedSetupService } from './marked-setup.service.js';

export type MarkdownTemplateTransform = (
  content: string,
  fileName: string
) => string | Promise<string> | Promise<VFile>;

let markedSetupServicePromise: undefined | Promise<MarkedSetupService>;

export const defaultMarkdownTemplateTransform: MarkdownTemplateTransform =
  async (content: string) => {
    if (!markedSetupServicePromise) {
      // set immediately to prevent other calls from seeing markedSetupServicePromise as
      // undefined - can't use await here
      markedSetupServicePromise = import('./marked-setup.service.js').then(
        ({ MarkedSetupService }) => new MarkedSetupService()
      );
    }
    // read template sections, parse markdown
    const markedSetupService = await markedSetupServicePromise;

    const mdContent = markedSetupService
      .getMarkedInstance()
      .parse(
        content.replace(FRONTMATTER_REGEX, '')
      ) as unknown as Promise<string>;

    return mdContent;
  };

export const defaultMarkdownTemplateTransforms: MarkdownTemplateTransform[] = [
  defaultMarkdownTemplateTransform,
];
