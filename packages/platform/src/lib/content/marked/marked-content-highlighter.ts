export abstract class MarkedContentHighlighter {
  augmentCodeBlock?(code: string, lang: string): string;

  abstract getHighlightExtension(): import('marked').MarkedExtension;
}
