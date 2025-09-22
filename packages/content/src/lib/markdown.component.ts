import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  NgZone,
  PLATFORM_ID,
  Signal,
  ViewEncapsulation,
  computed,
  inject,
  input,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Data } from '@angular/router';
import { from, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { AnchorNavigationDirective } from './anchor-navigation.directive';
import { ContentRenderer } from './content-renderer';
import { MERMAID_IMPORT_TOKEN } from './provide-content';

@Component({
  selector: 'analog-markdown',
  standalone: true,
  hostDirectives: [AnchorNavigationDirective],
  preserveWhitespaces: true,
  encapsulation: ViewEncapsulation.None,
  template: ` <div [innerHTML]="htmlContent()" [class]="classes()"></div> `,
})
export default class AnalogMarkdownComponent implements AfterViewChecked {
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  private zone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly mermaidImport = inject(MERMAID_IMPORT_TOKEN, {
    optional: true,
  });
  private mermaid: typeof import('mermaid') | undefined;

  private contentSource: Signal<SafeHtml | string | undefined> = toSignal(
    this.getContentSource(),
  );
  readonly htmlContent = computed(() => {
    const inputContent = this.content();

    if (inputContent) {
      return this.sanitizer.bypassSecurityTrustHtml(inputContent as string);
    }

    return this.contentSource();
  });
  readonly content = input<string | object | null>();
  readonly classes = input('analog-markdown');

  contentRenderer = inject(ContentRenderer);

  constructor() {
    if (isPlatformBrowser(this.platformId) && this.mermaidImport) {
      // Mermaid can only be loaded on client side
      this.loadMermaid(this.mermaidImport);
    }
  }

  getContentSource() {
    return this.route.data.pipe(
      map<Data, string>((data) => data['_analogContent'] ?? ''),
      switchMap((contentString) => this.renderContent(contentString)),
      map((content) => this.sanitizer.bypassSecurityTrustHtml(content)),
      catchError((e) => of(`There was an error ${e}`)),
    );
  }

  async renderContent(content: string): Promise<string> {
    return this.contentRenderer.render(content);
  }

  ngAfterViewChecked() {
    this.contentRenderer.enhance();
    this.zone.runOutsideAngular(() => this.mermaid?.default.run());
  }

  private loadMermaid(mermaidImport: Promise<typeof import('mermaid')>) {
    this.zone.runOutsideAngular(() =>
      // Wrap into an observable to avoid redundant initialization once
      // the markdown component is destroyed before the promise is resolved.
      from(mermaidImport)
        .pipe(takeUntilDestroyed())
        .subscribe((mermaid) => {
          this.mermaid = mermaid;
          this.mermaid.default.initialize({ startOnLoad: false });
          // Explicitly running mermaid as ngAfterViewChecked
          // has probably already been called
          this.mermaid?.default.run();
        }),
    );
  }
}
