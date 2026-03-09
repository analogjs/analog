import { MarkedExtension } from 'marked';
import { MarkedSetupService } from './marked-setup.service.js';
import { MarkedContentHighlighter } from './marked-content-highlighter.js';

export type WithMarkedOptions = {
  mangle?: boolean;
  extensions?: MarkedExtension[];
};

let markedSetupInstance: MarkedSetupService;

export function getMarkedSetup(
  options?: WithMarkedOptions,
  highlighter?: MarkedContentHighlighter,
) {
  markedSetupInstance ??= new MarkedSetupService(options, highlighter);
  return markedSetupInstance;
}
