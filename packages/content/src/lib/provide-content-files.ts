import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';

import {
  CONTENT_FILES_LIST_TOKEN,
  toContentFilesList,
} from './content-files-list-token';
import {
  CONTENT_FILES_TOKEN,
  toContentFilesRecord,
} from './content-files-token';

export interface ContentFilesInput {
  /**
   * Front matter attributes keyed by content filename.
   */
  list: Record<string, Record<string, any>>;
  /**
   * Lazily imported raw content keyed by content filename.
   */
  files: Record<string, () => Promise<string>>;
}

/**
 * Provides content files from an explicitly supplied input, for build
 * integrations that cannot inject the content file glob into this
 * package's module graph (e.g. esbuild-based builds), where the
 * glob-backed token factories resolve to empty maps.
 */
export function provideContentFiles(
  input: ContentFilesInput,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: CONTENT_FILES_LIST_TOKEN,
      useFactory: () => toContentFilesList(input.list),
    },
    {
      provide: CONTENT_FILES_TOKEN,
      useFactory: () =>
        toContentFilesRecord(input.files, inject(CONTENT_FILES_LIST_TOKEN)),
    },
  ]);
}
