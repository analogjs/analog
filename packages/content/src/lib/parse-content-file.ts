export type ContentFileModule<
  Attributes extends Record<string, any> = Record<string, any>,
> = {
  default: string;
  metadata: Attributes;
};

/**
 * Reads a loaded content file. Build-time content modules carry their
 * frontmatter as `metadata`; raw strings from custom loaders are parsed
 * with a lazily loaded frontmatter parser.
 */
export async function parseContentFile<
  Attributes extends Record<string, any> = Record<string, any>,
>(
  file: string | ContentFileModule<Attributes>,
): Promise<{ content: string; attributes: Attributes }> {
  if (typeof file !== 'string') {
    return { content: file.default, attributes: file.metadata };
  }

  const { parseRawContentFile } = await import('./parse-raw-content-file');
  return parseRawContentFile<Attributes>(file);
}
