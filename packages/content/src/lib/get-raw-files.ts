export const getRawFiles = () =>
  import.meta.glob('/src/content/**/*.md', {
    eager: true,
    as: 'raw',
  });
