import { MarkedExtension } from 'marked';

export type WithMarkedOptions = {
  mangle?: boolean;
  extensions?: MarkedExtension[];
};
