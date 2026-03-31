import { type SnapshotSerializer } from 'vitest';

export function createHtmlCommentSnapshotSerializer(): SnapshotSerializer {
  return {
    serialize: () => '',
    test: (val: any): boolean =>
      typeof Comment !== 'undefined' && val instanceof Comment,
  };
}
