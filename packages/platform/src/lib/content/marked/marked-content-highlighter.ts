export interface MarkedContentHighlighter {
  augmentCodeBlock?(code: string, lang: string): string;
}

export abstract class MarkedContentHighlighter {
  abstract getHighlightExtension(): import('marked').MarkedExtension;
}
