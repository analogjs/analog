export async function getFrontmatterMetadata(content: string) {
  const fm: any = await import('front-matter');
  // The `default` property will be available in CommonJS environment, for instance,
  // when running unit tests. It's safe to retrieve `default` first, since we still
  // fallback to the original implementation.
  const frontmatterFn: (code: string) => { attributes: object } =
    fm.default || fm;

  const { attributes } = frontmatterFn(content);

  return `\n\nexport const metadata = ${JSON.stringify(attributes)}`;
}
