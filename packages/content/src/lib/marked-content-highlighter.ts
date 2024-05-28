import {
  AbstractType,
  Injectable,
  Provider,
  ProviderToken,
  Type,
} from '@angular/core';

export interface MarkedContentHighlighter {
  augmentCodeBlock?(code: string, lang: string): string;
}

@Injectable()
export abstract class MarkedContentHighlighter {
  abstract getHighlightExtension(): import('marked').marked.MarkedExtension;
}

export function withHighlighter(
  provider: (
    | { useValue: MarkedContentHighlighter }
    | {
        useClass:
          | Type<MarkedContentHighlighter>
          | AbstractType<MarkedContentHighlighter>;
      }
    | { useFactory: (...deps: any[]) => MarkedContentHighlighter }
  ) & { deps?: ProviderToken<any>[] }
): Provider {
  return { provide: MarkedContentHighlighter, ...provider } as Provider;
}
