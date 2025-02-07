import { MarkdownTemplateTransform } from './markdown-transform';
import { type VFile } from 'vfile';

export async function getFrontmatterMetadata(
  content: string,
  id: string,
  transforms: MarkdownTemplateTransform[],
) {
  const fm: any = await import('front-matter');
  // The `default` property will be available in CommonJS environment, for instance,
  // when running unit tests. It's safe to retrieve `default` first, since we still
  // fallback to the original implementation.
  const frontmatterFn: (code: string) => { attributes: object } =
    fm.default || fm;

  let vfile: Partial<VFile> = {};
  for (const transform of transforms) {
    const result = await transform(content, id);
    vfile = typeof result === 'object' ? result : vfile;
  }

  const safeVFile = {
    path: vfile.path,
    data: vfile.data,
    messages: vfile.messages,
    history: vfile.history,
    cwd: vfile.cwd,
  };

  const { attributes } = frontmatterFn(content);

  const combinedMetadata = {
    ...attributes,
    vfile: safeVFile,
  };

  return `\n\nexport const metadata = ${JSON.stringify(combinedMetadata)}`;
}
