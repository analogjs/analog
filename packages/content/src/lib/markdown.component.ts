import { AsyncPipe, isPlatformBrowser } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  Input,
  NgZone,
  OnChanges,
  OnInit,
  PLATFORM_ID,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Data } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';

import { AnchorNavigationDirective } from './anchor-navigation.directive';
import { ContentRenderer } from './content-renderer';
import { USE_MERMAID_TOKEN } from './markdown-content-renderer.service';

@Component({
  selector: 'analog-markdown',
  standalone: true,
  imports: [AsyncPipe],
  hostDirectives: [AnchorNavigationDirective],
  preserveWhitespaces: true,
  encapsulation: ViewEncapsulation.None,
  template: `<div [innerHTML]="content$ | async" [class]="classes"></div>`,
})
export default class AnalogMarkdownComponent
  implements OnInit, OnChanges, AfterViewChecked
{
  private sanitizer = inject(DomSanitizer);
  private route = inject(ActivatedRoute);
  private zone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly useMermaid =
    inject(USE_MERMAID_TOKEN, { optional: true }) ?? false;
  private mermaid: typeof import('mermaid') | undefined;

  public content$: Observable<SafeHtml> = of('');

  @Input() content!: string | undefined | null;
  @Input() classes = 'analog-markdown';

  contentRenderer = inject(ContentRenderer);

  constructor() {
    if (isPlatformBrowser(this.platformId) && this.useMermaid) {
      // Mermaid can only be loaded on client side
      this.loadMermaid();
    }
  }

  async loadMermaid() {
    this.mermaid = await import('mermaid');
    this.mermaid.default.initialize({ startOnLoad: false });
    // Explicitly running mermaid as ngAfterViewChecked
    // has probably already been called
    this.zone.runOutsideAngular(() => this.mermaid?.default.run());
  }

  ngOnInit() {
    this.updateContent();
  }

  ngOnChanges(): void {
    this.updateContent();
  }

  updateContent() {
    this.content$ = this.route.data.pipe(
      map<Data, string>((data) => this.content ?? data['_analogContent']),
      mergeMap((contentString) => this.renderContent(contentString)),
      map((content) => this.sanitizer.bypassSecurityTrustHtml(content)),
      catchError((e) => of(`There was an error ${e}`))
    );
  }

  async renderContent(content: string): Promise<string> {
    return this.contentRenderer.render(content);
  }

  ngAfterViewChecked() {
    this.contentRenderer.enhance();
    this.zone.runOutsideAngular(() => this.mermaid?.default.run());
  }
}
