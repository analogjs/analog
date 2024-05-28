import { Injectable } from '@angular/core';

export interface MarkedContentHighlighter<
  TExtension extends import('marked').marked.MarkedExtension
> {
  augmentCodeBlock?(code: string, lang: string): string;
}

@Injectable()
export abstract class MarkedContentHighlighter<
  TExtension extends import('marked').marked.MarkedExtension
> {
  abstract getHighlightExtension(): TExtension;
}
