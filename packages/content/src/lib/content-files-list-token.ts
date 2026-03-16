import { InjectionToken } from '@angular/core';
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

export const CONTENT_FILES_LIST_TOKEN = new InjectionToken<ContentFile[]>(
  '@analogjs/content Content Files List',
  {
    providedIn: 'root',
    factory() {
      const contentFiles = getContentFilesList();

      return Object.keys(contentFiles).map((filename) => {
        const attributes = contentFiles[filename];
        const slug = attributes['slug'];

        return {
          filename,
          attributes,
          slug: slug ? encodeURI(slug) : encodeURI(getSlug(filename)),
        };
      });
    },
  },
);
