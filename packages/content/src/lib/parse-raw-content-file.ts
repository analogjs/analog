import fm from 'front-matter';

export function parseRawContentFile<Attributes extends Record<string, any>>(
  rawContentFile: string
): { content: string; attributes: Attributes } {
  const { body, attributes } = fm<Attributes>(rawContentFile);
  return { content: body, attributes };
}
