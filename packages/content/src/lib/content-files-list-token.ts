import { InjectionToken } from '@angular/core';
import { analogEsbuildContentMaps } from './analog-esbuild-globals';
import { ContentFile } from './content-file';
import { getContentFilesList } from './get-content-files';

function getSlug(filename: string) {
  // Extract the last path segment without its extension.
  // Handles names with dots like [[...slug]].md by stripping only the final extension.
  const lastSegment = (filename.split(/[/\\]/).pop() || '').trim();
  const base = lastSegment.replace(/\.[^./\\]+$/, ''); // strip only the final extension
  // Treat index.md as index route => empty slug
  return base === 'index' ? '' : base;
}

export function toContentFilesList(
  contentFiles: Record<string, Record<string, any>>,
): ContentFile[] {
  return Object.keys(contentFiles).map((filename) => {
    const attributes = contentFiles[filename];
    const slug = attributes['slug'];

    return {
      filename,
      attributes,
      slug: slug ? encodeURI(slug) : encodeURI(getSlug(filename)),
    };
  });
}

export const CONTENT_FILES_LIST_TOKEN = new InjectionToken<ContentFile[]>(
  '@analogjs/content Content Files List',
  {
    providedIn: 'root',
    factory() {
      const list = getContentFilesList();
      // The glob is empty outside of Vite; esbuild builds publish the
      // map through the injected boot module instead.
      return toContentFilesList(
        Object.keys(list).length
          ? list
          : (analogEsbuildContentMaps().contentFilesList ?? {}),
      );
    },
  },
);
