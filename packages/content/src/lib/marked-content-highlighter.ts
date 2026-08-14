import {
  AbstractType,
  Injectable,
  Provider,
  ProviderToken,
  Type,
} from '@angular/core';

@Injectable()
export abstract class MarkedContentHighlighter {
  augmentCodeBlock?(code: string, lang: string): string;
  abstract getHighlightExtension(): import('marked').MarkedExtension;
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
  ) & { deps?: ProviderToken<any>[] },
): Provider {
  return { provide: MarkedContentHighlighter, ...provider } as Provider;
}
