/**
 * Returns the list of content files by filename with ?analog-content-list=true.
 * We use the query param to transform the return into an array of
 * just front matter attributes.
 *
 * @returns
 */
export const getContentFilesList = () =>
  import.meta.glob<Record<string, any>>(
    ['/src/content/**/*.md', '/src/content/**/*.agx'],
    {
      eager: true,
      import: 'default',
      query: { 'analog-content-list': true },
    }
  );

/**
 * Returns the lazy loaded content files for lookups.
 *
 * @returns
 */
export const getContentFiles = () =>
  import.meta.glob(['/src/content/**/*.md', '/src/content/**/*.agx'], {
    query: '?raw',
    import: 'default',
  });
