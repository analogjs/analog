import { createImageHandler } from '@analogjs/content/image/server';

export default createImageHandler({
  dir: 'apps/blog-app/src/assets',
  domains: ['images.unsplash.com'],
});
